/**
 * แจ้ง ผอ. และผู้เกี่ยวข้องเมื่อมีการบันทึกข้อมูลสำคัญ (ส่งผ่าน NotifyService: LINE / Telegram)
 * เรียกจาก EntityService.save หลังบันทึกสำเร็จ — ถ้าแจ้งไม่สำเร็จ การบันทึกยังสำเร็จตามปกติ
 * ข้อมูลนักเรียน: ค่าเริ่มต้นแสดงเฉพาะชื่อต้นและห้อง (ไม่ส่งนามสกุล/รายละเอียดอ่อนไหวออกนอกระบบ)
 */
var AlertService = (function () {
  'use strict';

  var CARE_BAD = ['เสี่ยง', 'มีปัญหา'];

  function changed(previous, record, key) { return !previous || String(previous[key] || '') !== String(record[key] || ''); }
  function clip(text, size) { var value = String(text || '').replace(/\s+/g, ' ').trim(); return value.length > size ? value.slice(0, size) + '…' : value; }

  function thaiDate(iso) {
    var match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return Number(match[3]) + ' ' + months[Number(match[2]) - 1] + ' ' + (Number(match[1]) + 543);
  }

  function labels() { try { return EntityService.buildCachedLookups(); } catch (error) { return {}; } }
  function labelOf(list, id) {
    var item = (list || []).filter(function (entry) { return String(entry.id) === String(id); })[0];
    return item ? item.label : '';
  }

  function personnelName(lookups, id, context) {
    return labelOf(lookups.personnel, id) || (context && context.user && (context.user.displayName || context.user.username)) || '-';
  }

  // นักเรียน: ชื่อต้น + ห้อง (หรือชื่อเต็มเมื่อผู้ดูแลเปิดให้แสดง)
  function studentText(lookups, studentId, yearId) {
    var student = SheetRepository.findById('Students', studentId);
    var room = '';
    var enrollment = SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.studentId) === String(studentId) && (!yearId || String(row.academicYearId) === String(yearId));
    })[0];
    if (enrollment) room = labelOf(lookups.homerooms, enrollment.homeroomId);
    var name = !student ? 'นักเรียน' : NotifyService.showStudentNames()
      ? labelOf(lookups.students, studentId) || String(student.firstName || 'นักเรียน') : String(student.firstName || 'นักเรียน');
    return name + (room ? ' ห้อง ' + room : '');
  }

  // ลิงก์เปิดใบลาในระบบ (หลังเข้าสู่ระบบจะเปิดหน้าพิจารณาใบลานั้นทันที)
  function openUrl(id) {
    var base = DistributionService.systemUrl(Tenant.code());
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'open=leave&id=' + encodeURIComponent(id);
  }

  function link() {
    try { return '\nเปิดระบบ: ' + DistributionService.systemUrl(Tenant.code()); } catch (error) { return ''; }
  }

  // แต่ละเมนู -> [เรื่องที่แจ้ง, ฟังก์ชันสร้างข้อความ (คืน '' = ไม่แจ้ง)]
  var BUILDERS = {
    'safety-incidents': ['safety-incident', function (record, previous, context, lookups) {
      if (!previous) {
        return '⚠️ แจ้งเหตุความไม่ปลอดภัย [' + (record.severity || '-') + ']\n' + clip(record.category, 60) + (record.hazardType ? ' / ' + record.hazardType : '') +
          '\nสถานที่: ' + clip(record.location, 120) + '\nวันที่: ' + thaiDate(record.incidentDate) + (record.incidentTime ? ' เวลา ' + record.incidentTime : '') +
          '\nรายละเอียด: ' + clip(record.description, 220) + (record.initialAction ? '\nดำเนินการเบื้องต้น: ' + clip(record.initialAction, 160) : '') +
          '\nผู้แจ้ง: ' + personnelName(lookups, '', context);
      }
      if (changed(previous, record, 'status') && ['แก้ไขแล้ว', 'ปิดเรื่อง', 'ส่งต่อ'].indexOf(record.status) !== -1) {
        return '✅ เหตุความไม่ปลอดภัย: ' + record.status + '\nสถานที่: ' + clip(record.location, 120) + ' (' + thaiDate(record.incidentDate) + ')' +
          (record.resolution ? '\nผลการแก้ไข: ' + clip(record.resolution, 200) : '');
      }
      return '';
    }],
    'safety-risks': ['safety-risk', function (record, previous, context, lookups) {
      if (!previous) {
        return '🚧 พบจุดเสี่ยง ระดับ' + (record.riskLevel || '-') + '\nจุด: ' + clip(record.location, 120) + (record.category ? '\nกลุ่มภัย: ' + clip(record.category, 60) : '') +
          '\nลักษณะความเสี่ยง: ' + clip(record.detail, 220) + (record.responsibleId ? '\nผู้รับผิดชอบแก้ไข: ' + personnelName(lookups, record.responsibleId) : '') +
          (record.dueDate ? '\nกำหนดเสร็จ: ' + thaiDate(record.dueDate) : '') + '\nผู้แจ้ง: ' + personnelName(lookups, '', context);
      }
      if (changed(previous, record, 'status') && record.status === 'แก้ไขแล้ว') {
        return '✅ แก้ไขจุดเสี่ยงแล้ว: ' + clip(record.location, 120) + (record.fixDetail ? '\nการแก้ไข: ' + clip(record.fixDetail, 200) : '');
      }
      return '';
    }],
    'lesson-plans': ['lesson-plan', function (record, previous, context, lookups) {
      var sent = !previous || (record.fileId && !previous.fileId);
      if (!sent) return '';
      return '📘 ' + (previous ? 'ครูส่งไฟล์แผนการสอน' : 'ครูส่งแผนการสอน') + '\nครู: ' + personnelName(lookups, record.teacherId, context) +
        '\nวิชา: ' + clip(record.subjectName, 100) + (record.gradeLevel ? ' ชั้น ' + record.gradeLevel : '') +
        (record.unit ? '\nหน่วย: ' + clip(record.unit, 100) : '') + '\nแผน: ' + clip(record.title, 150) + (record.fileId ? '\n(แนบไฟล์แผนแล้ว)' : '\n(ยังไม่แนบไฟล์)');
    }],
    'home-visits': ['home-visit', function (record, previous, context, lookups) {
      if (previous) return '';
      var flags = [];
      if (record.economicStatus === 'ยากจน' || record.economicStatus === 'ขาดแคลน') flags.push('ฐานะ' + record.economicStatus);
      if (record.familyRelation === 'มีความรุนแรงในครอบครัว') flags.push('มีความรุนแรงในครอบครัว');
      if (record.debt === 'มีหนี้สินและเดือดร้อนมาก') flags.push('หนี้สินเดือดร้อนมาก');
      if (record.houseCondition === 'ทรุดโทรม/ต้องซ่อมแซม') flags.push('บ้านทรุดโทรม');
      return (flags.length ? '🏠⚠️ เยี่ยมบ้าน: พบกรณีควรช่วยเหลือ' : '🏠 บันทึกการเยี่ยมบ้าน') + '\nนักเรียน: ' + studentText(lookups, record.studentId, record.academicYearId) +
        '\nวันที่: ' + thaiDate(record.visitDate) + '\nครูผู้เยี่ยม: ' + personnelName(lookups, record.visitorId, context) +
        (flags.length ? '\nสิ่งที่พบ: ' + flags.join(', ') : '');
    }],
    'screenings': ['care-risk', function (record, previous, context, lookups) {
      if (CARE_BAD.indexOf(record.result) === -1 || (previous && previous.result === record.result)) return '';
      var sides = [['learning', 'การเรียน'], ['health', 'สุขภาพ'], ['economy', 'เศรษฐกิจ'], ['protection', 'การคุ้มครอง'], ['drug', 'สารเสพติด'], ['sexual', 'พฤติกรรมทางเพศ']]
        .filter(function (side) { return CARE_BAD.indexOf(record[side[0]]) !== -1; }).map(function (side) { return side[1] + '(' + record[side[0]] + ')'; });
      return '🔎 คัดกรองพบนักเรียนกลุ่ม' + record.result + '\nนักเรียน: ' + studentText(lookups, record.studentId, record.academicYearId) +
        '\nด้าน: ' + sides.join(', ') + '\nผู้คัดกรอง: ' + personnelName(lookups, record.screenerId, context);
    }],
    'sdq': ['care-risk', function (record, previous, context, lookups) {
      if (CARE_BAD.indexOf(record.result) === -1 || (previous && previous.result === record.result)) return '';
      return '🔎 SDQ ผล' + record.result + ' (คะแนนรวม ' + record.totalScore + ', ผู้ประเมิน: ' + (record.assessor || '-') + ')\nนักเรียน: ' +
        studentText(lookups, record.studentId, record.academicYearId) + '\nบันทึกโดย: ' + personnelName(lookups, '', context);
    }],
    'student-support': ['care-risk', function (record, previous, context, lookups) {
      if (record.group !== 'มีปัญหา' || (previous && previous.group === 'มีปัญหา')) return '';
      return '🤝 ระบบดูแลช่วยเหลือ: นักเรียนกลุ่มมีปัญหา' + (record.issue ? ' ด้าน' + record.issue : '') + '\nนักเรียน: ' +
        studentText(lookups, record.studentId, record.academicYearId) + '\nครูผู้รับผิดชอบ: ' + personnelName(lookups, record.advisorId, context);
    }],
    'referrals': ['referral', function (record, previous, context, lookups) {
      if (previous) return '';
      return '📨 ส่งต่อนักเรียน (' + (record.referType || '-') + ')\nนักเรียน: ' + studentText(lookups, record.studentId, record.academicYearId) +
        '\nส่งถึง: ' + clip(record.destination, 120) + '\nวันที่: ' + thaiDate(record.referDate) + '\nผู้ส่งต่อ: ' + personnelName(lookups, record.referrerId, context);
    }],
    'leave-requests': [null, function (record, previous, context, lookups) {
      var who = personnelName(lookups, record.personnelId, context);
      var span = thaiDate(record.fromDate) + (record.toDate && record.toDate !== record.fromDate ? ' – ' + thaiDate(record.toDate) : '') +
        (record.days ? ' (' + record.days + ' วันทำการ)' : '');
      // แนบใบลา (PDF) และเอกสารประกอบ + ปุ่มเปิดใบลาในระบบเพื่อพิจารณา
      var files = [{ fileId: record.formFileId, name: 'ใบลา_' + who.replace(/\s+/g, '_') + '.pdf', caption: 'ใบลา ' + who + ' (' + record.leaveType + ')' },
        { fileId: record.fileId, caption: 'เอกสารประกอบใบลา ' + who }];
      if (!previous) {
        return { event: 'leave-request', files: files, button: { text: '📝 เปิดใบลาเพื่อพิจารณาอนุมัติ', url: openUrl(record.id) },
          text: '📝 ขอ' + (record.leaveType || 'ลา') + ' — รออนุมัติ\nผู้ขอ: ' + who + '\nวันที่: ' + span +
          '\nเหตุผล: ' + clip(record.reason, 200) + (record.contact ? '\nติดต่อได้ที่: ' + clip(record.contact, 100) : '') +
          (record.formFileId ? '\n📎 แนบใบลา (PDF)' + (record.fileId ? ' และเอกสารประกอบ' : '') : '') };
      }
      if (changed(previous, record, 'status') && (record.status === 'อนุมัติ' || record.status === 'ไม่อนุมัติ')) {
        return { event: 'leave-decision', files: files.slice(0, 1), button: { text: 'ดูใบลาในระบบ', url: openUrl(record.id) },
          text: (record.status === 'อนุมัติ' ? '✅ อนุมัติ' : '❌ ไม่อนุมัติ') + record.leaveType + '\nผู้ขอ: ' + who +
          '\nวันที่: ' + span + (record.approverNote ? '\nความเห็น: ' + clip(record.approverNote, 160) : '') +
          (record.approvedBy ? '\nโดย: ' + record.approvedBy : '') };
      }
      return '';
    }]
  };

  function onEntitySave(entity, record, previous, context) {
    var builder = BUILDERS[entity.key];
    if (!builder) return null;
    // เช็กก่อนว่าเปิดแจ้งเรื่องนี้ไว้ไหม จะได้ไม่ต้องอ่านข้อมูลเพิ่ม
    var candidates = builder[0] ? [builder[0]] : ['leave-request', 'leave-decision'];
    if (!candidates.some(function (key) { return NotifyService.wants(key); })) return null;
    try {
      var built = builder[1](record, previous || null, context, labels());
      if (!built) return null;
      var eventKey = typeof built === 'object' ? built.event : builder[0];
      var text = typeof built === 'object' ? built.text : built;
      var extras = typeof built === 'object' ? { button: built.button, files: built.files } : null;
      return NotifyService.notify(eventKey, extras && extras.button ? text : text + link(), extras);
    } catch (error) {
      console.error(JSON.stringify({ code: 'ALERT_FAILED', entity: entity.key, message: error.message }));
      return null;
    }
  }

  return { onEntitySave: onEntitySave, BUILDERS: BUILDERS };
})();
