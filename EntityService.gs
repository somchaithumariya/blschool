/**
 * บริการกลางสำหรับโมดูลแบบตาราง/ฟอร์มทุกตัวใน APP_CONFIG.ENTITIES
 * list / save / remove / importRows / lookups / uploadFile / getFile
 */
var EntityService = (function () {
  'use strict';

  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  // คีย์ที่ต้องไม่ซ้ำในแต่ละโมดูล
  var UNIQUE_KEYS = {
    'personnel': [['personnelCode']],
    'students': [['studentCode']],
    'student-enrollments': [['academicYearId', 'studentId'], ['academicYearId', 'homeroomId', 'number']],
    'homerooms': [['academicYearId', 'gradeLevel', 'roomName']],
    'personnel-years': [['academicYearId', 'personnelId']],
    'student-information': [['academicYearId', 'studentId']],
    'timetable': [['academicYearId', 'homeroomId', 'weekday', 'period']],
    'porpor5': [['academicYearId', 'subjectCode', 'homeroomId']],
    'periods': [['periodNo']],
    'approval-positions': [['academicYearId', 'role']],
    'signatures': [['personnelId']],
    'student-family': [['studentId']],
    'pa-evaluations': [['academicYearId', 'round', 'teacherId']],
    'homeroom-logs': [['homeroomId', 'logDate']],
    'project-reports': [['projectId']]
  };

  // ค่าที่ระบบคำนวณให้เองก่อนบันทึก
  var COMPUTE = {
    'sdq': function (values) {
      var total = ['emotional', 'conduct', 'hyperactivity', 'peer'].reduce(function (sum, key) {
        return sum + (Number(values[key]) || 0);
      }, 0);
      var cutoff = values.assessor === 'นักเรียน' ? [15, 18] : [14, 16];
      values.totalScore = total;
      values.result = total <= cutoff[0] ? 'ปกติ' : total <= cutoff[1] ? 'เสี่ยง' : 'มีปัญหา';
      return values;
    },
    // ผลคัดกรองรวม = ด้านที่หนักที่สุดใน 6 ด้าน
    'screenings': function (values) {
      var levels = ['ปกติ', 'เสี่ยง', 'มีปัญหา'];
      var worst = 0;
      ['learning', 'health', 'economy', 'protection', 'drug', 'sexual'].forEach(function (key) {
        worst = Math.max(worst, levels.indexOf(values[key]));
      });
      values.result = levels[worst];
      return values;
    },
    // ผลรวมของโครงการ: ตัดสินจากผลเทียบเป้าหมายเชิงปริมาณและเชิงคุณภาพ
    'project-reports': function (values) {
      var both = [values.quantStatus, values.qualStatus];
      values.result = !values.quantStatus || !values.qualStatus ? ''
        : both.every(function (status) { return status === 'บรรลุ'; }) ? 'บรรลุเป้าหมาย'
        : both.every(function (status) { return status === 'ไม่บรรลุ'; }) ? 'ไม่บรรลุเป้าหมาย' : 'บรรลุเป้าหมายบางส่วน';
      return values;
    }
  };

  // ตรวจเงื่อนไขเฉพาะของบางเมนู (นอกเหนือจากชนิดข้อมูลทั่วไป)
  var VALIDATE = {
    'pa-evaluations': function (values, errors) {
      var people = ['committee1Id', 'committee2Id', 'committee3Id'];
      people.forEach(function (key, index) {
        if (!values[key]) return;
        if (String(values[key]) === String(values.teacherId)) errors[key] = 'กรรมการต้องไม่ใช่ผู้รับการประเมิน';
        else if (people.slice(0, index).some(function (other) { return String(values[other]) === String(values[key]); })) errors[key] = 'กรรมการซ้ำกัน';
      });
    },
    'teaching-logs': function (values, errors) {
      if (values.studentsPassed !== '' && values.studentsTotal !== '' && values.studentsPassed > values.studentsTotal) {
        errors.studentsPassed = 'ต้องไม่เกินจำนวนนักเรียนทั้งหมด';
      }
    },
    'homeroom-logs': function (values) {
      values.followStudentIds = studentIdList(values.followStudentIds).join(',');
    },
    'plc': function (values) {
      values.memberIds = idList(values.memberIds, 'Personnel').join(',');
    },
    'swot-issues': function (values) {
      values.audiences = audienceList(values.audiences);
    },
    'needs-items': function (values, errors) {
      values.audiences = audienceList(values.audiences);
      var codes = standardCodes(values.standard);
      if (values.mainIssue && codes.main.indexOf(values.mainIssue) === -1) errors.mainIssue = 'ไม่มีประเด็นนี้ในมาตรฐานที่เลือก (เช่น ' + codes.main.slice(0, 2).join(', ') + ')';
      if (values.subIssue && (codes.sub.indexOf(values.subIssue) === -1 || values.subIssue.indexOf(values.mainIssue + '.') !== 0)) {
        errors.subIssue = 'ประเด็นรองต้องอยู่ใต้ประเด็นหลักที่เลือก';
      }
    },
    'projects': function (values, errors) {
      values.teamIds = idList(values.teamIds, 'Personnel').join(',');
      var codes = standardCodes(values.standard);
      var subs = codeList(values.subIssues).filter(function (code) { return codes.sub.indexOf(code) !== -1; });
      var mains = codeList(values.mainIssues).filter(function (code) { return codes.main.indexOf(code) !== -1; });
      subs.forEach(function (code) { var main = code.split('.').slice(0, 2).join('.'); if (mains.indexOf(main) === -1) mains.push(main); });
      values.mainIssues = mains.sort().join(',');
      values.subIssues = subs.sort().join(',');
      if (values.startDate && values.endDate && values.endDate < values.startDate) errors.endDate = 'ต้องไม่ก่อนวันเริ่มดำเนินการ';
    }
  };

  // กลุ่มผู้ตอบแบบสอบถาม SWOT (คั่นด้วย ,): เก็บเฉพาะชื่อกลุ่มที่ระบบรู้จัก
  function audienceList(text) {
    var list = String(text || '').split(',').map(function (name) { return name.trim(); });
    return APP_CONFIG.SWOT_RESPONDENTS.filter(function (name) { return list.indexOf(name) !== -1; }).join(',');
  }
  function codeList(text) { return String(text || '').split(/[,\s]+/).map(function (code) { return code.trim(); }).filter(Boolean); }
  // รหัสประเด็นหลัก/รองของมาตรฐาน เช่น มาตรฐานที่ 1 → main [1.1, 1.2] sub [1.1.1 … 1.2.4]
  function standardCodes(name) {
    var standard = APP_CONFIG.QA_STANDARDS.filter(function (item) { return item.name === name; })[0];
    var main = [];
    var sub = [];
    (standard ? standard.issues : []).forEach(function (issue) {
      main.push(issue.code);
      issue.subs.forEach(function (item) { sub.push(item.code); });
    });
    return { main: main, sub: sub };
  }

  // รหัสหลายรายการในช่องเดียว (คั่นด้วย ,) ของตารางใดก็ได้: เก็บเฉพาะที่มีอยู่จริง ไม่ซ้ำ
  function idList(text, sheetName) {
    var ids = String(text || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean);
    if (!ids.length) return [];
    var known = indexBy(SheetRepository.all(sheetName));
    return ids.filter(function (id, index) { return known[id] && ids.indexOf(id) === index; });
  }

  // รายชื่อนักเรียนหลายคนในช่องเดียว (คั่นด้วย ,): เก็บเฉพาะรหัสนักเรียนที่มีอยู่จริง ไม่ซ้ำ
  function studentIdList(text) {
    var ids = String(text || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean);
    if (!ids.length) return [];
    var known = indexBy(SheetRepository.all('Students'));
    return ids.filter(function (id, index) { return known[id] && ids.indexOf(id) === index; });
  }

  // ---------- บันทึกหลังการสอน / บันทึกโฮมรูม: ครูบันทึกและแก้ไขได้เฉพาะของตนเอง ----------
  // บันทึกหลังการสอน: ผู้มีสิทธิ์แก้ไขการนิเทศ (ผู้บริหาร/ผู้ดูแลระบบ) จัดการแทนได้ทุกคน
  // บันทึกโฮมรูม: ครูที่ปรึกษา/ครูที่ปรึกษาร่วมของห้องนั้น หรือผู้มีสิทธิ์ตั้งค่าครูที่ปรึกษา
  function ownPersonnelId(context, errors, field) {
    var own = String(context.user.personnelId || '');
    if (!own) errors[field] = 'บัญชีของคุณยังไม่ได้ผูกกับทะเบียนบุคลากร กรุณาแจ้งผู้ดูแลระบบ';
    return own;
  }
  // ---------- เหตุความปลอดภัย / จุดเสี่ยง: แยกบทบาท ----------
  // ทีมความปลอดภัย (safety.manage) จัดการได้ทุกอย่าง · ผู้รับผิดชอบที่ได้รับมอบหมายอัปเดตความคืบหน้าได้ (ปิดเรื่องไม่ได้ เปลี่ยนผู้รับผิดชอบไม่ได้)
  // · ผู้แจ้งแก้รายการที่ตนแจ้งได้ระหว่างยังไม่มีคนรับเรื่อง · เหตุระดับรุนแรง/วิกฤตต้องมี AAR ก่อน "ปิดเรื่อง"
  var SAFETY_RULES = {
    'safety-incidents': { first: 'รับแจ้ง', closed: ['ปิดเรื่อง'], clear: ['resolution', 'resolvedDate'], label: 'เหตุ' },
    'safety-risks': { first: 'รอดำเนินการ', closed: [], clear: ['fixDetail', 'fixedDate'], label: 'จุดเสี่ยง' }
  };
  var SERIOUS = /^(รุนแรง|วิกฤต)/;
  function canManageSafety(context) { return Core.hasPermission(context.permissions, 'safety.manage'); }

  function guardSafety(key) {
    return function (context, values, previous, errors) {
      var rule = SAFETY_RULES[key];
      if (key === 'safety-incidents' && values.status === 'ปิดเรื่อง' && SERIOUS.test(values.severity || '') &&
        !(previous && previous.status === 'ปิดเรื่อง') && !hasAar(previous && previous.id)) {
        errors.status = 'เหตุระดับรุนแรง/วิกฤต ต้องถอดบทเรียน AAR ก่อนปิดเรื่อง (กดปุ่ม “AAR” ในแถวของเหตุนี้)';
      }
      if (canManageSafety(context)) return;
      var own = String(context.user.personnelId || '');
      if (!previous) {
        values.status = rule.first;
        values.responsibleId = '';
        rule.clear.forEach(function (field) { values[field] = ''; });
        return;
      }
      var responsible = own && String(previous.responsibleId || '') === own;
      var reporter = String(previous.createdBy || '') === String(context.user.id) && previous.status === rule.first && !previous.responsibleId;
      if (responsible) {
        values.responsibleId = previous.responsibleId;
        if (rule.closed.indexOf(values.status) !== -1 && values.status !== previous.status) errors.status = 'การปิดเรื่องทำได้เฉพาะทีมความปลอดภัย';
      } else if (reporter) {
        values.status = rule.first;
        values.responsibleId = '';
      } else {
        errors.status = 'แก้ไขได้เฉพาะ' + rule.label + 'ที่คุณแจ้งเอง (ก่อนมีผู้รับเรื่อง) หรือ' + rule.label + 'ที่คุณได้รับมอบหมาย';
      }
    };
  }

  function hasAar(incidentId) {
    if (!incidentId) return false;
    return SheetRepository.all('AarRecords').some(function (row) { return String(row.sourceId) === String(incidentId); });
  }

  function canManageTeachingLogs(context) { return Core.hasPermission(context.permissions, 'supervision.edit'); }
  function canManageHomeroomLogs(context) { return Core.hasPermission(context.permissions, 'homeroom.edit'); }
  function isAdvisorOf(homeroomId, personnelId) {
    var room = homeroomId ? SheetRepository.findById('Homerooms', homeroomId) : null;
    return !!room && !!personnelId && (String(room.advisorId) === String(personnelId) || String(room.coAdvisorId) === String(personnelId));
  }

  // ---------- ใบลา: ครูยื่นได้เฉพาะของตนเอง ผู้มีสิทธิ์ leave.approve เท่านั้นที่อนุมัติ/ไม่อนุมัติได้ ----------
  var LEAVE_PENDING = 'รออนุมัติ';
  function canApproveLeave(context) { return Core.hasPermission(context.permissions, 'leave.approve'); }

  // ---------- นิเทศการสอน / PLC ----------
  // ผู้มีสิทธิ์แก้ไขการนิเทศ (ผู้บริหาร) จัดการได้ทุกรายการ · ครูส่งคำขอ/ให้คะแนนผ่าน SupervisionService เท่านั้น
  function canManageSupervision(context) { return Core.hasPermission(context.permissions, 'supervision.edit'); }
  function isPlcMember(row, context) {
    var own = String(context.user.personnelId || '');
    return String(row.createdBy || '') === String(context.user.id) ||
      (!!own && String(row.memberIds || '').split(',').indexOf(own) !== -1);
  }

  // รายการที่ผู้ใช้เห็นในตารางรวม: ผู้บริหารเห็นทั้งหมด ครูเห็นเฉพาะที่ตนเป็นผู้รับการนิเทศหรือกรรมการ
  // (ผลของตนเองเห็นเมื่อสรุปผลแล้วเท่านั้น)
  var SCOPE = {
    'supervision': function (context, rows) {
      if (canManageSupervision(context)) return rows;
      var own = String(context.user.personnelId || '');
      if (!own) return [];
      return rows.filter(function (row) {
        return String(row.teacherId) === own || SupervisionService.committeeOf(row).indexOf(own) !== -1;
      }).map(function (row) {
        if (row.status === 'ประเมินแล้ว' || SupervisionService.committeeOf(row).indexOf(own) !== -1) return row;
        return Object.assign({}, row, { score: '', result: '', scoresJson: '', strengths: '', improvements: '', bestPractice: '', notes: '', aiAdvice: '' });
      });
    }
  };

  function canReview(context) { return Core.hasPermission(context.permissions, 'review.approve'); }
  function canManagePlan(context) { return Core.hasPermission(context.permissions, 'swot.edit'); }
  function isProjectMember(project, personnelId) {
    var own = String(personnelId || '');
    return !!own && (String(project.responsibleId) === own || String(project.teamIds || '').split(',').indexOf(own) !== -1);
  }

  var GUARDS = {
    // รายงานไปราชการ/พัฒนาตนเอง: ครูรายงานและแก้ไขได้เฉพาะของตนเอง (ผู้บริหารแก้แทนได้)
    'dev-reports': function (context, values, previous, errors) {
      if (values.toDate && values.fromDate && values.toDate < values.fromDate) errors.toDate = 'ต้องไม่ก่อนวันที่เริ่ม';
      if (canReview(context)) return;
      var own = ownPersonnelId(context, errors, 'personnelId');
      if (own && (String(values.personnelId) !== own || (previous && String(previous.personnelId) !== own))) {
        errors.personnelId = 'รายงานหรือแก้ไขได้เฉพาะของตนเอง';
      }
    },
    'supervision': function (context, values, previous) {
      if (!values.status) values.status = previous && previous.status ? previous.status : values.supervisorId ? 'รอประเมิน' : 'รอมอบหมาย';
      if (values.status === 'รอมอบหมาย' && values.supervisorId) values.status = 'รอประเมิน';
    },
    'plc': function (context, values, previous, errors) {
      if (!previous || canManageSupervision(context) || isPlcMember(previous, context)) return;
      errors.teamName = 'แก้ไขได้เฉพาะบันทึก PLC ที่คุณบันทึกเองหรือเป็นสมาชิกของกลุ่ม';
    },
    'leave-requests': function (context, values, previous, errors) {
      if (!values.toDate) values.toDate = values.fromDate;
      if (values.fromDate && values.toDate && values.toDate < values.fromDate) errors.toDate = 'ต้องไม่ก่อนวันที่เริ่มลา';
      values.days = values.fromDate && !errors.toDate ? CheckinService.workingDays(values.fromDate, values.toDate).length : '';
      if (!canApproveLeave(context)) {
        var own = String(context.user.personnelId || '');
        if (!own) errors.personnelId = 'บัญชีของคุณยังไม่ได้ผูกกับทะเบียนบุคลากร กรุณาแจ้งผู้ดูแลระบบ';
        else if (String(values.personnelId) !== own || (previous && String(previous.personnelId) !== own)) errors.personnelId = 'ยื่นหรือแก้ไขได้เฉพาะใบลาของตนเอง';
        if (previous && previous.status !== LEAVE_PENDING) errors.status = 'ใบลาที่พิจารณาแล้วแก้ไขไม่ได้ กรุณาติดต่อผู้อนุมัติ';
        values.status = LEAVE_PENDING;
        values.approverNote = previous ? previous.approverNote || '' : '';
        values.approvedBy = '';
        return;
      }
      values.approvedBy = values.status === LEAVE_PENDING ? ''
        : previous && previous.status === values.status && previous.approvedBy ? previous.approvedBy : (context.user.displayName || context.user.username);
    },
    'teaching-logs': function (context, values, previous, errors) {
      if (canManageTeachingLogs(context)) return;
      var own = ownPersonnelId(context, errors, 'teacherId');
      if (own && (String(values.teacherId) !== own || (previous && String(previous.teacherId) !== own))) {
        errors.teacherId = 'บันทึกหรือแก้ไขได้เฉพาะบันทึกหลังการสอนของตนเอง';
      }
    },
    'homeroom-logs': function (context, values, previous, errors) {
      var room = values.homeroomId ? SheetRepository.findById('Homerooms', values.homeroomId) : null;
      if (room) values.academicYearId = room.academicYearId;
      if (!values.teacherId && context.user.personnelId) values.teacherId = String(context.user.personnelId);
      if (canManageHomeroomLogs(context)) return;
      var own = ownPersonnelId(context, errors, 'homeroomId');
      if (own && (!isAdvisorOf(values.homeroomId, own) || (previous && !isAdvisorOf(previous.homeroomId, own)))) {
        errors.homeroomId = 'บันทึกได้เฉพาะห้องที่คุณเป็นครูที่ปรึกษา';
      }
    }
  };

  // โครงการ: ผู้มีสิทธิ์แก้ไขแผนกลยุทธ์ (swot.edit) จัดการได้ทุกโครงการและเป็นผู้อนุมัติ
  // ครูเสนอ/แก้ได้เฉพาะโครงการที่ตนเป็นผู้รับผิดชอบหรือผู้ร่วมรับผิดชอบ และเปลี่ยนเป็น "อนุมัติ"/"ยกเลิก" เองไม่ได้
  GUARDS['projects'] = function (context, values, previous, errors) {
    var strategy = values.strategyId ? SheetRepository.findById('StrategyItems', values.strategyId) : null;
    if (values.strategyId && (!strategy || strategy.level !== 'strategy')) errors.strategyId = 'กรุณาเลือกกลยุทธ์';
    else if (strategy && String(strategy.academicYearId) !== String(values.academicYearId)) errors.strategyId = 'กลยุทธ์นี้เป็นของปีการศึกษาอื่น';
    if (!values.status) values.status = previous && previous.status ? previous.status : 'เสนอโครงการ';
    if (canManagePlan(context)) return;
    var own = ownPersonnelId(context, errors, 'responsibleId');
    if (own && (!isProjectMember(values, own) || (previous && !isProjectMember(previous, own)))) {
      errors.responsibleId = 'เสนอหรือแก้ไขได้เฉพาะโครงการที่คุณเป็นผู้รับผิดชอบหรือผู้ร่วมรับผิดชอบ';
    }
    var before = previous ? previous.status : 'เสนอโครงการ';
    if (['อนุมัติ', 'ยกเลิก'].indexOf(values.status) !== -1 && values.status !== before) errors.status = 'ผู้บริหารหรือผู้รับผิดชอบแผนเป็นผู้อนุมัติ/ยกเลิกโครงการ';
  };
  // รายงานผลโครงการ: ปีการศึกษาตามโครงการ · ครูรายงานได้เฉพาะโครงการที่ตนรับผิดชอบ ในนามของตนเอง
  GUARDS['project-reports'] = function (context, values, previous, errors) {
    var project = values.projectId ? SheetRepository.findById('Projects', values.projectId) : null;
    if (project) { values.academicYearId = project.academicYearId; delete errors.academicYearId; }
    if (canManagePlan(context)) return;
    var own = ownPersonnelId(context, errors, 'reporterId');
    if (!own) return;
    if (String(values.reporterId) !== own || (previous && String(previous.reporterId) !== own)) errors.reporterId = 'รายงานหรือแก้ไขได้เฉพาะในนามของตนเอง';
    else if (project && !isProjectMember(project, own)) errors.projectId = 'รายงานได้เฉพาะโครงการที่คุณเป็นผู้รับผิดชอบหรือผู้ร่วมรับผิดชอบ';
  };
  GUARDS['safety-incidents'] = guardSafety('safety-incidents');
  GUARDS['safety-risks'] = guardSafety('safety-risks');

  function guardRemove(entity, row, context) {
    if (entity.key === 'projects') {
      if (SheetRepository.all('ProjectReports').some(function (report) { return String(report.projectId) === String(row.id); })) {
        throw SheetRepository.serviceError('VALIDATION_ERROR', 'โครงการนี้มีรายงานผลแล้ว กรุณาลบรายงานผลก่อน');
      }
      if (!canManagePlan(context) && (String(row.responsibleId) !== String(context.user.personnelId || '') || row.status !== 'เสนอโครงการ')) {
        throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะโครงการที่คุณรับผิดชอบและยังไม่ได้รับอนุมัติ');
      }
    }
    if (entity.key === 'project-reports' && !canManagePlan(context) && String(row.reporterId) !== String(context.user.personnelId || '')) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะรายงานผลที่คุณรายงานเอง');
    }
    if (entity.key === 'dev-reports' && !canReview(context) && String(row.personnelId) !== String(context.user.personnelId || '')) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะรายงานของตนเอง');
    }
    if (entity.key === 'plc' && !canManageSupervision(context) && !isPlcMember(row, context)) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะบันทึก PLC ที่คุณบันทึกเองหรือเป็นสมาชิกของกลุ่ม');
    }
    if (SAFETY_RULES[entity.key] && !canManageSafety(context) &&
      !(String(row.createdBy || '') === String(context.user.id) && row.status === SAFETY_RULES[entity.key].first && !row.responsibleId)) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะรายการที่คุณแจ้งเองและยังไม่มีผู้รับเรื่อง');
    }
    if (entity.key === 'teaching-logs' && !canManageTeachingLogs(context) && String(row.teacherId) !== String(context.user.personnelId || '')) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะบันทึกหลังการสอนของตนเอง');
    }
    if (entity.key === 'homeroom-logs' && !canManageHomeroomLogs(context) && !isAdvisorOf(row.homeroomId, context.user.personnelId)) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะบันทึกโฮมรูมของห้องที่คุณเป็นครูที่ปรึกษา');
    }
    if (entity.key !== 'leave-requests' || canApproveLeave(context)) return;
    if (String(row.personnelId) !== String(context.user.personnelId || '') || row.status !== LEAVE_PENDING) {
      throw SheetRepository.serviceError('FORBIDDEN', 'ลบได้เฉพาะใบลาของตนเองที่ยังรออนุมัติ');
    }
  }

  // หลังบันทึก: ใบลาที่อนุมัติ -> บันทึกการลงเวลาให้อัตโนมัติ
  var AFTER_SAVE = {
    'leave-requests': function (record, previous, context) {
      if (record.status === 'อนุมัติ' || (previous && previous.status === 'อนุมัติ')) CheckinService.syncLeave(record, context.user.id);
    }
  };

  // พิกัด GPS: ต้องเป็นตัวเลขในช่วงที่ถูกต้อง และต้องกรอกคู่กัน
  function validateGeo(entity, values, errors) {
    var lat = entity.fields.filter(function (field) { return field.geo === 'lat'; })[0];
    var lng = entity.fields.filter(function (field) { return field.geo === 'lng'; })[0];
    if (!lat || !lng) return;
    var a = String(values[lat.key] || '').trim();
    var b = String(values[lng.key] || '').trim();
    if (!a && !b) return;
    if (!a || !b) { errors[a ? lng.key : lat.key] = 'กรุณากรอกละติจูดและลองจิจูดให้ครบคู่'; return; }
    if (!/^-?\d{1,3}(\.\d+)?$/.test(a) || Math.abs(Number(a)) > 90) errors[lat.key] = 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90';
    if (!/^-?\d{1,3}(\.\d+)?$/.test(b) || Math.abs(Number(b)) > 180) errors[lng.key] = 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180';
  }

  // lookup ที่ใช้ใน field แบบ ref
  var LOOKUP_SHEETS = {
    titles: 'Titles', positions: 'Positions', personnelTypes: 'PersonnelTypes', standings: 'Standings',
    divisions: 'Divisions', subjectGroups: 'SubjectGroups', personnel: 'Personnel', students: 'Students',
    homerooms: 'Homerooms', strategies: 'StrategyItems', projects: 'Projects'
  };

  function getEntity(key) {
    var entity = APP_CONFIG.ENTITIES[key];
    if (!entity) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบโมดูลที่ระบุ');
    return entity;
  }

  function list(token, data) {
    var entity = getEntity(data && data.entity);
    var context = AuthService.requirePermission(token, entity.viewPermission);
    var yearId = entity.yearScoped && data.academicYearId ? String(data.academicYearId) : '';
    var all = SheetRepository.memoResult('entity:' + entity.key + ':' + yearId, function () {
      var rows = SheetRepository.all(entity.sheet);
      if (yearId) rows = rows.filter(function (row) { return String(row.academicYearId) === yearId; });
      return { entity: entity.key, rows: sortRows(entity, rows) };
    }, { deps: [entity.sheet] });
    if (SCOPE[entity.key]) all = { entity: entity.key, rows: SCOPE[entity.key](context, all.rows) };
    return data.page ? pageOf(entity, all.rows, data) : all;
  }

  // ---------- แบ่งหน้าจากฝั่งเซิร์ฟเวอร์ ----------
  // ตารางเล็ก (ไม่เกิน FULL_LIMIT แถว) ส่งทั้งหมดครั้งเดียว ตารางใหญ่ส่งเฉพาะหน้าที่ขอ พร้อมจำนวนทั้งหมด
  // หน้าเว็บแสดงหน้าแรกได้ทันที แล้วค่อยโหลดข้อมูลทั้งหมดเบื้องหลังเพื่อให้ค้นหา/เปลี่ยนหน้าได้ทันที
  var FULL_LIMIT = 300;
  var MAX_PAGE_SIZE = 200;
  var THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  function pageOf(entity, rows, data) {
    if (rows.length <= FULL_LIMIT) return { entity: entity.key, rows: rows, total: rows.length, all: rows.length, full: true };
    var visible = filterRows(entity, rows, data.filters, data.q);
    var size = Math.min(MAX_PAGE_SIZE, Math.max(10, Number(data.pageSize) || 50));
    var pages = Math.max(1, Math.ceil(visible.length / size));
    var page = Math.min(pages, Math.max(1, Math.floor(Number(data.page) || 1)));
    return { entity: entity.key, rows: visible.slice((page - 1) * size, page * size), total: visible.length, all: rows.length,
      page: page, pageSize: size, paged: true };
  }

  // แถวที่ตรงกับตัวกรองและคำค้นของหน้าตาราง (ใช้กับการแบ่งหน้า และให้น้องบอทเห็นข้อมูลชุดเดียวกับที่ผู้ใช้เห็น)
  function filterRows(entity, rows, filters, q) {
    var wanted = filters && typeof filters === 'object' ? filters : {};
    var text = String(q || '').trim().toLowerCase().slice(0, 100);
    var filterKeys = Object.keys(wanted).filter(function (key) { return wanted[key] !== '' && wanted[key] !== null && wanted[key] !== undefined; });
    if (!filterKeys.length && !text) return rows;
    var labels = text ? cachedLookups() : null;
    return rows.filter(function (row) {
      for (var index = 0; index < filterKeys.length; index += 1) {
        if (String(row[filterKeys[index]]) !== String(wanted[filterKeys[index]])) return false;
      }
      if (!text) return true;
      return entity.fields.some(function (field) { return searchText(field, row[field.key], labels).indexOf(text) !== -1; });
    });
  }

  // ข้อความที่ใช้ค้นหา ให้ตรงกับที่หน้าเว็บแสดง (ชื่อแทนรหัส วันที่แบบไทย)
  function searchText(field, value, labels) {
    if (value === '' || value === null || value === undefined) return '';
    var text = String(value);
    if ((field.type === 'ref' || field.type === 'year') && labels) {
      var list = labels[field.type === 'year' ? 'academicYears' : field.ref] || [];
      var found = list.filter(function (item) { return String(item.id) === text; })[0];
      return found ? String(found.label).toLowerCase() : '';
    }
    if (field.type === 'date') {
      var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? text + ' ' + Number(match[3]) + ' ' + THAI_MONTHS[Number(match[2]) - 1] + ' ' + (Number(match[1]) + 543) : text;
    }
    if (field.type === 'checkbox') return value === true ? 'ใช่' : '';
    return text.toLowerCase();
  }

  function sortRows(entity, rows) {
    var keys = String(entity.order || '').split(',').filter(Boolean);
    if (!keys.length) return rows;
    return rows.sort(function (a, b) {
      for (var index = 0; index < keys.length; index += 1) {
        var desc = keys[index].charAt(0) === '-';
        var key = desc ? keys[index].slice(1) : keys[index];
        var left = a[key];
        var right = b[key];
        var compare = typeof left === 'number' && typeof right === 'number' ? left - right
          : String(left).localeCompare(String(right), 'th', { numeric: true });
        if (compare !== 0) return desc ? -compare : compare;
      }
      return 0;
    });
  }

  function clean(entity, input) {
    var values = {};
    var errors = {};
    entity.fields.forEach(function (field) {
      if (field.computed) return;
      var raw = input ? input[field.key] : undefined;
      // ช่องที่หน้าเว็บสร้างให้เอง (เช่น ใบลา PDF): ไม่ส่งมา = ไม่แก้ค่าเดิม
      if (field.system && raw === undefined) return;
      var value;
      switch (field.type) {
        case 'checkbox':
          value = raw === true || raw === 'true' || raw === 'on' || raw === 'TRUE' || raw === 'ใช่';
          break;
        case 'number':
          value = raw === '' || raw === null || raw === undefined ? '' : Number(raw);
          if (value !== '' && !isFinite(value)) errors[field.key] = 'กรุณาระบุตัวเลข';
          else if (value !== '' && value < 0) errors[field.key] = 'ต้องไม่ติดลบ';
          else if (value !== '' && field.max && value > field.max) errors[field.key] = 'ต้องไม่เกิน ' + field.max;
          break;
        case 'date':
          value = String(raw || '').trim();
          if (value && !DATE_PATTERN.test(value)) errors[field.key] = 'รูปแบบวันที่ไม่ถูกต้อง';
          break;
        case 'select':
          value = String(raw || '').trim();
          if (value && field.options.indexOf(value) === -1) errors[field.key] = 'กรุณาเลือกจากรายการ';
          break;
        default:
          value = String(raw === null || raw === undefined ? '' : raw).trim();
          if (field.max && field.type !== 'number' && value.length > field.max) errors[field.key] = 'ยาวเกิน ' + field.max + ' ตัวอักษร';
      }
      if (field.required && (value === '' || value === null) && field.type !== 'checkbox') errors[field.key] = 'กรุณากรอกข้อมูล';
      values[field.key] = value;
    });
    return { values: values, errors: errors };
  }

  function validateRefs(entity, values, errors) {
    entity.fields.forEach(function (field) {
      var value = values[field.key];
      if (!value || errors[field.key]) return;
      var sheet = field.type === 'year' ? 'AcademicYears' : field.type === 'ref' ? LOOKUP_SHEETS[field.ref] : null;
      if (!sheet) return;
      if (!SheetRepository.findById(sheet, value)) errors[field.key] = 'ไม่พบข้อมูลที่อ้างอิง';
    });
  }

  function validateUnique(entity, values, currentId, existingRows, errors) {
    (UNIQUE_KEYS[entity.key] || []).forEach(function (keys) {
      if (keys.some(function (key) { return values[key] === '' || values[key] === undefined; })) return;
      var duplicate = existingRows.some(function (row) {
        return String(row.id) !== String(currentId) && keys.every(function (key) { return String(row[key]) === String(values[key]); });
      });
      if (duplicate) errors[keys[keys.length - 1]] = 'ข้อมูลนี้มีอยู่แล้ว';
    });
  }

  function prepare(entity, input, currentId, existingRows) {
    var result = clean(entity, input);
    validateRefs(entity, result.values, result.errors);
    validateUnique(entity, result.values, currentId, existingRows, result.errors);
    validateGeo(entity, result.values, result.errors);
    if (VALIDATE[entity.key]) VALIDATE[entity.key](result.values, result.errors);
    if (COMPUTE[entity.key]) COMPUTE[entity.key](result.values);
    return result;
  }

  // ห้องรับฟัง: รับเรื่องผ่านหน้าของนักเรียน และอัปเดต/ตอบกลับผ่าน ConcernService เท่านั้น (ไม่ให้แก้ข้อความของนักเรียนหรือสร้าง/นำเข้าเรื่องปลอม)
  var SERVICE_ONLY = { 'student-concerns': 'แก้ไขหรือนำเข้าเรื่องของนักเรียนทางนี้ไม่ได้ ใช้ปุ่มในหน้า “ห้องรับฟังนักเรียน”' };
  function requireManualWrite(entity) {
    if (SERVICE_ONLY[entity.key]) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', { message: SERVICE_ONLY[entity.key] });
  }

  function save(token, data) {
    var payload = data || {};
    var entity = getEntity(payload.entity);
    var context = AuthService.requirePermission(token, entity.editPermission);
    requireManualWrite(entity);
    var existing = SheetRepository.all(entity.sheet);
    var previous = payload.id ? existing.filter(function (row) { return String(row.id) === String(payload.id); })[0] || null : null;
    var prepared = prepare(entity, payload.values, payload.id, existing);
    if (GUARDS[entity.key]) GUARDS[entity.key](context, prepared.values, previous, prepared.errors);
    if (!Core.isEmptyObject(prepared.errors)) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', prepared.errors);
    }
    var record = payload.id
      ? SheetRepository.update(entity.sheet, payload.id, prepared.values, payload.version, context.user.id)
      : SheetRepository.insert(entity.sheet, prepared.values, context.user.id);
    AuditService.write(payload.id ? 'UPDATE' : 'CREATE', entity.sheet, record.id, {}, context.user.id);
    if (AFTER_SAVE[entity.key]) AFTER_SAVE[entity.key](record, previous, context);
    // แจ้ง ผอ./ผู้เกี่ยวข้องทาง LINE/Telegram (ถ้าเปิดไว้) — ไม่ให้กระทบการบันทึก
    try { AlertService.onEntitySave(entity, record, previous, context); } catch (error) { console.error('alert: ' + error.message); }
    return record;
  }

  function remove(token, data) {
    var payload = data || {};
    var entity = getEntity(payload.entity);
    var context = AuthService.requirePermission(token, entity.editPermission);
    var row = SheetRepository.findById(entity.sheet, payload.id);
    if (row) guardRemove(entity, row, context);
    SheetRepository.softDelete(entity.sheet, payload.id, payload.version, context.user.id);
    if (row && AFTER_SAVE[entity.key]) AFTER_SAVE[entity.key](Object.assign({}, row, { isDeleted: true, status: 'ลบแล้ว' }), row, context);
    AuditService.write('DELETE', entity.sheet, payload.id, {}, context.user.id);
    return { id: payload.id };
  }

  // นำเข้าหลายแถว: ตรวจทุกแถวก่อน ถ้ามีข้อผิดพลาดจะไม่บันทึกเลยสักแถว
  function importRows(token, data) {
    var payload = data || {};
    var entity = getEntity(payload.entity);
    var context = AuthService.requirePermission(token, entity.editPermission);
    requireManualWrite(entity);
    var rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบข้อมูลที่จะนำเข้า');
    if (rows.length > 2000) throw SheetRepository.serviceError('VALIDATION_ERROR', 'นำเข้าได้ครั้งละไม่เกิน 2,000 แถว');
    var existing = SheetRepository.all(entity.sheet);
    var accepted = [];
    var problems = [];
    rows.forEach(function (input, index) {
      var prepared = prepare(entity, input, null, existing.concat(accepted));
      if (!Core.isEmptyObject(prepared.errors)) {
        problems.push({ row: index + 2, errors: prepared.errors });
      } else accepted.push(prepared.values);
    });
    if (problems.length) {
      var error = SheetRepository.serviceError('IMPORT_ERROR', 'พบข้อผิดพลาด ' + problems.length + ' แถว ยังไม่ได้บันทึกข้อมูล');
      error.fieldErrors = { rows: problems.slice(0, 50) };
      throw error;
    }
    SheetRepository.insertMany(entity.sheet, accepted, context.user.id);
    AuditService.write('IMPORT', entity.sheet, '', { count: accepted.length }, context.user.id);
    return { imported: accepted.length };
  }

  // รายการอ้างอิงที่หน้าเว็บใช้แสดงชื่อแทน id (โหลดครั้งเดียวต่อการเข้าสู่ระบบ)
  function lookups(token) {
    AuthService.requireSession(token);
    return cachedLookups();
  }

  function cachedLookups() {
    return SheetRepository.memoResult('lookups', buildLookups, { deps: LOOKUP_DEPS, persist: 'lookups' });
  }

  var LOOKUP_DEPS = ['Titles', 'AcademicYears', 'Positions', 'PersonnelTypes', 'Standings', 'Divisions', 'SubjectGroups', 'Personnel',
    'Students', 'Homerooms', 'Periods', 'StrategyItems', 'Projects'];

  function buildLookups() {
    var titles = indexBy(SheetRepository.all('Titles'));
    function simple(sheet) {
      return SheetRepository.all(sheet).map(function (row) { return { id: row.id, label: row.name }; })
        .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'th'); });
    }
    function personName(row) {
      var title = titles[row.titleId] ? titles[row.titleId].name : '';
      return (title + row.firstName + ' ' + row.lastName).trim();
    }
    var years = SheetRepository.all('AcademicYears').map(function (row) {
      return { id: row.id, label: row.year + '/' + row.term, year: row.year, term: row.term, isActive: row.isActive === true,
        startsAt: row.startsAt, endsAt: row.endsAt };
    }).sort(function (a, b) { return String(b.year) + b.term > String(a.year) + a.term ? 1 : -1; });
    return {
      academicYears: years,
      titles: simple('Titles'),
      positions: simple('Positions'),
      personnelTypes: simple('PersonnelTypes'),
      standings: simple('Standings'),
      divisions: simple('Divisions'),
      subjectGroups: simple('SubjectGroups'),
      personnel: SheetRepository.all('Personnel').map(function (row) {
        return { id: row.id, label: personName(row), code: row.personnelCode };
      }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'th'); }),
      students: SheetRepository.all('Students').map(function (row) {
        return { id: row.id, label: personName(row), code: row.studentCode, gender: row.gender };
      }).sort(function (a, b) { return String(a.code).localeCompare(String(b.code), 'th', { numeric: true }); }),
      homerooms: SheetRepository.all('Homerooms').map(function (row) {
        return { id: row.id, label: row.gradeLevel + '/' + row.roomName, academicYearId: row.academicYearId,
          gradeLevel: row.gradeLevel, advisorId: row.advisorId, coAdvisorId: row.coAdvisorId };
      }).sort(function (a, b) {
        var grades = APP_CONFIG.GRADE_LEVELS;
        return (grades.indexOf(a.gradeLevel) - grades.indexOf(b.gradeLevel)) ||
          String(a.label).localeCompare(String(b.label), 'th', { numeric: true });
      }),
      // กลยุทธ์ของแผนกลยุทธ์ (ใช้เลือกในโครงการ) และโครงการ (ใช้เลือกในรายงานผล)
      strategies: SheetRepository.all('StrategyItems').filter(function (row) { return row.level === 'strategy'; })
        .sort(function (a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); })
        .map(function (row) { return { id: row.id, label: (row.code ? row.code + ' ' : '') + String(row.text || '').slice(0, 160), academicYearId: row.academicYearId }; }),
      projects: SheetRepository.all('Projects').sort(function (a, b) { return String(a.code || a.name).localeCompare(String(b.code || b.name), 'th', { numeric: true }); })
        .map(function (row) { return { id: row.id, label: (row.code ? row.code + ' ' : '') + row.name, academicYearId: row.academicYearId,
          strategyId: row.strategyId, responsibleId: row.responsibleId, teamIds: row.teamIds }; }),
      periods: SheetRepository.all('Periods').sort(function (a, b) { return Number(a.periodNo) - Number(b.periodNo); })
        .map(function (row) { return { id: row.id, periodNo: row.periodNo, label: row.label, startTime: row.startTime, endTime: row.endTime }; })
    };
  }

  function indexBy(rows) {
    return rows.reduce(function (index, row) { index[row.id] = row; return index; }, {});
  }

  function uploadFile(token, data) {
    var payload = data || {};
    var entity = getEntity(payload.entity);
    var context = AuthService.requirePermission(token, entity.editPermission);
    var bytes = Utilities.base64Decode(String(payload.base64 || ''));
    if (!bytes.length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบไฟล์');
    if (bytes.length > APP_CONFIG.MAX_UPLOAD_BYTES) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไฟล์ต้องมีขนาดไม่เกิน 8 MB');
    var name = String(payload.name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
    var mimeType = String(payload.mimeType || 'application/octet-stream').slice(0, 100);
    var folder = FolderService.getFolder(entity.folder || 'exports');
    var file = folder.createFile(Utilities.newBlob(bytes, mimeType, name));
    SheetRepository.insert('Files', { fileId: file.getId(), fileName: name, mimeType: mimeType, ownerId: context.user.id,
      entity: entity.key }, context.user.id);
    return { fileId: file.getId(), fileName: name };
  }

  function getFile(token, data) {
    var context = AuthService.requireSession(token);
    var fileId = String((data && data.fileId) || '');
    var record = SheetRepository.findByField('Files', 'fileId', fileId)[0];
    if (!record) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบไฟล์');
    var entity = APP_CONFIG.ENTITIES[record.entity];
    var permission = entity ? entity.viewPermission : 'settings.view';
    if (!Core.hasPermission(context.permissions, permission)) throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่มีสิทธิ์เปิดไฟล์นี้');
    var blob = DriveApp.getFileById(fileId).getBlob();
    if (blob.getBytes().length > APP_CONFIG.MAX_UPLOAD_BYTES) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไฟล์มีขนาดใหญ่เกินไป');
    return { name: record.fileName, mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }

  return { buildCachedLookups: cachedLookups, filterRows: filterRows, list: list, save: save, remove: remove, importRows: importRows, lookups: lookups, uploadFile: uploadFile,
    getFile: getFile, clean: clean, prepare: prepare, getEntity: getEntity, COMPUTE: COMPUTE, indexBy: indexBy };
})();
