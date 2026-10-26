/**
 * ส่งรายงานถึงผู้บริหาร: ครูกด "ส่งผู้บริหาร" จากรายงานของตน (ไปราชการ/พัฒนาตนเอง แผนการสอน บันทึกหลังการสอน PLC บันทึกโฮมรูม)
 * → แจ้งผู้บริหารทันทีทาง Telegram/LINE และอีเมล → ผู้บริหารอ่านเอกสารแบบบันทึกข้อความ ให้ความเห็น แล้ว "ลงนาม" หรือ "ส่งกลับแก้ไข"
 * → ผลส่งกลับทางอีเมลของผู้ส่ง · เอกสารพิมพ์/บันทึกเป็น PDF ได้พร้อมภาพลายเซ็นจากเมนู "ลายเซ็น"
 */
var ReviewService = (function () {
  'use strict';

  var PENDING = 'รอพิจารณา';
  var SIGNED = 'ลงนามแล้ว';
  var RETURNED = 'ส่งกลับแก้ไข';
  var PERMISSION = 'review.approve';

  // เมนูที่ส่งได้: ตาราง ชื่อเอกสาร และวิธีหาเจ้าของรายงาน
  var KINDS = {
    'dev-reports': { owner: function (row) { return row.personnelId; },
      title: function (row) { return (row.reportType || 'รายงาน') + ': ' + (row.title || ''); } },
    'lesson-plans': { owner: function (row) { return row.teacherId; },
      title: function (row) { return 'แผนการจัดการเรียนรู้: ' + (row.title || '') + (row.subjectName ? ' (' + row.subjectName + ')' : ''); } },
    'teaching-logs': { owner: function (row) { return row.teacherId; },
      title: function (row) { return 'บันทึกหลังการสอน: ' + (row.subjectName || '') + ' เรื่อง ' + (row.topic || '') + ' (' + (row.teachDate || '') + ')'; } },
    'plc': { owner: function (row) { return ''; },
      title: function (row) { return 'บันทึกกิจกรรม PLC: ' + (row.topic || row.teamName || ''); } },
    'homeroom-logs': { owner: function (row) { return row.teacherId; },
      title: function (row) { return 'บันทึกกิจกรรมโฮมรูม วันที่ ' + (row.logDate || ''); } },
    // โครงการ: ผู้บริหารลงนาม = อนุมัติโครงการ
    'projects': { owner: function (row) { return row.responsibleId; },
      title: function (row) { return 'ขออนุมัติโครงการ: ' + (row.code ? row.code + ' ' : '') + (row.name || ''); },
      onSigned: function (row, actorId) {
        if (row.status === 'เสนอโครงการ') SheetRepository.update('Projects', row.id, { status: 'อนุมัติ' }, row.version, actorId);
      } },
    'project-reports': { owner: function (row) { return row.reporterId; },
      title: function (row) {
        var project = row.projectId ? SheetRepository.findById('Projects', row.projectId) : null;
        return 'รายงานผลโครงการ: ' + (project ? project.name : '');
      } }
  };

  function fail(code, message, fields) { return SheetRepository.serviceError(code, message, fields); }
  function canReview(context) { return Core.hasPermission(context.permissions, PERMISSION); }
  function own(context) { return String(context.user.personnelId || ''); }

  function entityOf(key) {
    if (!KINDS[key]) throw fail('VALIDATION_ERROR', 'รายงานประเภทนี้ส่งผู้บริหารไม่ได้');
    return APP_CONFIG.ENTITIES[key];
  }

  function recordOf(key, id) {
    var row = SheetRepository.findById(entityOf(key).sheet, id);
    if (!row) throw fail('NOT_FOUND', 'ไม่พบรายงาน');
    return row;
  }

  // เจ้าของรายงาน: PLC = ผู้บันทึกหรือสมาชิก · โฮมรูม = ผู้บันทึกหรือครูที่ปรึกษา · อื่น ๆ = บุคลากรในรายงาน
  function isOwner(context, key, row) {
    var me = own(context);
    if (String(row.createdBy || '') === String(context.user.id)) return true;
    if (!me) return false;
    if (key === 'plc') return String(row.memberIds || '').split(',').indexOf(me) !== -1;
    if (key === 'projects' && String(row.teamIds || '').split(',').indexOf(me) !== -1) return true;
    if (key === 'homeroom-logs') {
      var room = row.homeroomId ? SheetRepository.findById('Homerooms', row.homeroomId) : null;
      if (room && (String(room.advisorId) === me || String(room.coAdvisorId) === me)) return true;
    }
    return String(KINDS[key].owner(row) || '') === me;
  }

  function reviewsOf(key, recordId) {
    return SheetRepository.all('ReportReviews').filter(function (row) { return row.entity === key && String(row.recordId) === String(recordId); });
  }

  function openUrl(id) {
    try {
      var base = DistributionService.systemUrl(Tenant.code());
      return base + (base.indexOf('?') === -1 ? '?' : '&') + 'open=review&id=' + encodeURIComponent(id);
    } catch (error) { return ''; }
  }

  function personName(id) {
    var person = id ? SheetRepository.findById('Personnel', id) : null;
    if (!person) return '';
    var title = person.titleId ? SheetRepository.findById('Titles', person.titleId) : null;
    return (((title && title.name) || '') + (person.firstName || '') + ' ' + (person.lastName || '')).trim();
  }

  function positionOf(id) {
    var person = id ? SheetRepository.findById('Personnel', id) : null;
    if (!person) return '';
    var position = person.positionId ? SheetRepository.findById('Positions', person.positionId) : null;
    var standing = person.standingId ? SheetRepository.findById('Standings', person.standingId) : null;
    return [position && position.name, standing && standing.name].filter(Boolean).join(' วิทยฐานะ');
  }

  // ผู้บริหารที่ได้รับแจ้ง: ผู้ใช้ที่เปิดใช้งาน มีอีเมล และบทบาทได้รับสิทธิ์ "ลงนามรายงาน" (ไม่นับผู้ดูแลระบบที่ได้ทุกสิทธิ์โดยอัตโนมัติ)
  function reviewerEmails() {
    var permission = SheetRepository.all('Permissions').filter(function (row) { return row.key === PERMISSION; })[0];
    if (!permission) return [];
    var roleIds = SheetRepository.all('RolePermissions').filter(function (row) { return String(row.permissionId) === String(permission.id); })
      .map(function (row) { return String(row.roleId); });
    var userIds = SheetRepository.all('UserRoles').filter(function (row) { return roleIds.indexOf(String(row.roleId)) !== -1; })
      .map(function (row) { return String(row.userId); });
    return SheetRepository.all('Users').filter(function (user) {
      return userIds.indexOf(String(user.id)) !== -1 && user.isActive !== false && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || ''));
    }).map(function (user) { return String(user.email).trim(); }).filter(function (email, index, list) { return list.indexOf(email) === index; });
  }

  function mail(to, subject, body) {
    if (!to || (Array.isArray(to) && !to.length)) return false;
    try {
      var school = '';
      try { school = SettingsService.getPublicSettings().schoolName || ''; } catch (error) { school = ''; }
      MailApp.sendEmail({ to: Array.isArray(to) ? to.join(',') : to, subject: (school ? '[' + school + '] ' : '') + subject, body: body, name: school || 'ระบบบริหารจัดการโรงเรียน' });
      return true;
    } catch (error) {
      console.error(JSON.stringify({ code: 'REVIEW_MAIL_FAILED', message: error.message }));
      return false;
    }
  }

  // ---------- ครูส่งรายงาน ----------
  function submit(token, data) {
    var payload = data || {};
    var entity = entityOf(payload.entity);
    var context = AuthService.requirePermission(token, entity.viewPermission);
    var row = recordOf(payload.entity, payload.id);
    if (!isOwner(context, payload.entity, row)) throw fail('FORBIDDEN', 'ส่งได้เฉพาะรายงานของตนเอง');
    var note = String(payload.note || '').trim().slice(0, 500);
    var title = KINDS[payload.entity].title(row).slice(0, 300);
    var existing = reviewsOf(payload.entity, row.id).sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); })[0];
    if (existing && existing.status === PENDING) throw fail('VALIDATION_ERROR', 'ส่งรายงานนี้แล้ว อยู่ระหว่างรอผู้บริหารพิจารณา');
    if (existing && existing.status === SIGNED) throw fail('VALIDATION_ERROR', 'ผู้บริหารลงนามรายงานนี้แล้ว');
    var values = { entity: payload.entity, recordId: row.id, title: title, submitterUserId: context.user.id, submitterPersonnelId: own(context),
      note: note, status: PENDING, comment: '', reviewerUserId: '', reviewerPersonnelId: '', reviewerName: '', submittedAt: Core.nowIso(),
      reviewedAt: '', academicYearId: row.academicYearId || '' };
    var saved = existing
      ? SheetRepository.update('ReportReviews', existing.id, Object.assign(values, { round: (Number(existing.round) || 1) + 1 }), existing.version, context.user.id)
      : SheetRepository.insert('ReportReviews', Object.assign(values, { round: 1 }), context.user.id);
    AuditService.write('REPORT_SUBMIT', 'ReportReviews', saved.id, { entity: payload.entity }, context.user.id);
    var sender = context.user.displayName || personName(own(context)) || context.user.username;
    var url = openUrl(saved.id);
    var text = '📨 มีรายงานส่งถึงผู้บริหาร' + (Number(saved.round) > 1 ? ' (ส่งใหม่หลังแก้ไข)' : '') + '\n' + title + '\nผู้ส่ง: ' + sender + (note ? '\nข้อความ: ' + note : '');
    try { NotifyService.notify('report-review', text, url ? { button: { text: '🖊️ เปิดรายงานเพื่อลงนาม', url: url } } : null); } catch (error) { console.error('notify: ' + error.message); }
    var mailed = mail(reviewerEmails(), 'รายงานรอลงนาม: ' + title, text + '\n\nเปิดรายงานเพื่อให้ความเห็นและลงนาม:\n' + (url || 'เมนู “ส่งรายงานถึงผู้บริหาร” ในระบบ'));
    return { id: saved.id, status: saved.status, round: saved.round, mailed: mailed };
  }

  // สถานะการส่งของรายการในตาราง (ให้หน้าเว็บแสดงป้าย/ปุ่ม)
  function statusOf(token, data) {
    var payload = data || {};
    var entity = entityOf(payload.entity);
    var context = AuthService.requirePermission(token, entity.viewPermission);
    var me = String(context.user.id);
    var reviewer = canReview(context);
    var result = {};
    SheetRepository.all('ReportReviews').forEach(function (row) {
      if (row.entity !== payload.entity) return;
      if (!reviewer && String(row.submitterUserId) !== me) return;
      result[row.recordId] = { id: row.id, status: row.status };
    });
    return result;
  }

  // ---------- รายการ: ของฉัน / รอพิจารณา / พิจารณาแล้ว ----------
  function list(token, data) {
    var context = AuthService.requirePermission(token, 'review.view');
    var payload = data || {};
    var reviewer = canReview(context);
    var yearId = String(payload.academicYearId || '');
    var rows = SheetRepository.all('ReportReviews').filter(function (row) { return !yearId || !row.academicYearId || String(row.academicYearId) === yearId; })
      .map(function (row) {
        return { id: row.id, entity: row.entity, recordId: row.recordId, title: row.title, status: row.status, note: row.note, comment: row.comment,
          submitterPersonnelId: row.submitterPersonnelId, submitterUserId: row.submitterUserId, reviewerName: row.reviewerName,
          submittedAt: row.submittedAt, reviewedAt: row.reviewedAt, round: row.round, label: APP_CONFIG.ENTITIES[row.entity] ? APP_CONFIG.ENTITIES[row.entity].label : row.entity };
      }).sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
    var me = String(context.user.id);
    return { canReview: reviewer, mine: rows.filter(function (row) { return String(row.submitterUserId) === me; }),
      pending: reviewer ? rows.filter(function (row) { return row.status === PENDING; }) : [],
      done: reviewer ? rows.filter(function (row) { return row.status !== PENDING; }) : [] };
  }

  // ---------- เปิดเอกสาร: ข้อมูลรายงาน + ผู้ส่ง/ผู้ลงนาม + ภาพลายเซ็น + ตราครุฑ ----------
  function get(token, data) {
    var context = AuthService.requirePermission(token, 'review.view');
    var review = SheetRepository.findById('ReportReviews', data && data.id);
    if (!review) throw fail('NOT_FOUND', 'ไม่พบรายงานที่ส่ง');
    var reviewer = canReview(context);
    if (!reviewer && String(review.submitterUserId) !== String(context.user.id)) throw fail('FORBIDDEN', 'คุณไม่มีสิทธิ์เปิดรายงานนี้');
    var entity = entityOf(review.entity);
    var record = SheetRepository.findById(entity.sheet, review.recordId);
    if (!record) throw fail('NOT_FOUND', 'รายงานต้นฉบับถูกลบแล้ว');
    var settings = SettingsService.getPublicSettings();
    var garuda = '';
    try { garuda = DistributionService.assets().garuda; } catch (error) { garuda = ''; }
    var decided = review.status !== PENDING;
    return {
      review: review, record: record, entity: review.entity, canReview: reviewer && review.status === PENDING, canReopen: reviewer && decided,
      fields: entity.fields.map(function (field) { return { key: field.key, label: field.label, type: field.type, ref: field.ref, multi: field.multi }; }),
      school: { name: settings.schoolName || '', affiliation: settings.schoolAffiliation || '', directorName: settings.directorName || '' },
      submitter: { name: personName(review.submitterPersonnelId), position: positionOf(review.submitterPersonnelId),
        signature: LeaveService.signatureOf(review.submitterPersonnelId) },
      reviewer: decided ? { name: review.reviewerName || personName(review.reviewerPersonnelId), position: positionOf(review.reviewerPersonnelId),
        signature: review.status === SIGNED ? LeaveService.signatureOf(review.reviewerPersonnelId) : '' }
        : { name: settings.directorName || '', position: '', signature: '' },
      garuda: garuda
    };
  }

  // ดูตัวอย่างเอกสาร/พิมพ์ก่อนส่ง (ยังไม่มีความเห็นผู้บริหาร)
  function preview(token, data) {
    var payload = data || {};
    var entity = entityOf(payload.entity);
    var context = AuthService.requirePermission(token, entity.viewPermission);
    var row = recordOf(payload.entity, payload.id);
    if (!isOwner(context, payload.entity, row) && !canReview(context)) throw fail('FORBIDDEN', 'พิมพ์ได้เฉพาะรายงานของตนเอง');
    var me = isOwner(context, payload.entity, row) ? own(context) : String(KINDS[payload.entity].owner(row) || own(context));
    var settings = SettingsService.getPublicSettings();
    var garuda = '';
    try { garuda = DistributionService.assets().garuda; } catch (error) { garuda = ''; }
    return { review: null, record: row, entity: payload.entity, canReview: false, canReopen: false,
      fields: entity.fields.map(function (field) { return { key: field.key, label: field.label, type: field.type, ref: field.ref, multi: field.multi }; }),
      school: { name: settings.schoolName || '', affiliation: settings.schoolAffiliation || '', directorName: settings.directorName || '' },
      submitter: { name: personName(me), position: positionOf(me), signature: LeaveService.signatureOf(me) },
      reviewer: { name: settings.directorName || '', position: '', signature: '' }, garuda: garuda };
  }

  // ---------- ผู้บริหารพิจารณา: ลงนาม หรือส่งกลับแก้ไข แล้วแจ้งผู้ส่งทางอีเมล ----------
  function decide(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    var payload = data || {};
    var review = SheetRepository.findById('ReportReviews', payload.id);
    if (!review) throw fail('NOT_FOUND', 'ไม่พบรายงานที่ส่ง');
    if (review.status !== PENDING) throw fail('VALIDATION_ERROR', 'รายงานนี้พิจารณาแล้ว');
    var decision = payload.decision === RETURNED ? RETURNED : payload.decision === SIGNED ? SIGNED : '';
    if (!decision) throw fail('VALIDATION_ERROR', 'กรุณาเลือกผลการพิจารณา');
    var comment = String(payload.comment || '').trim().slice(0, 2000);
    if (decision === RETURNED && !comment) throw fail('VALIDATION_ERROR', 'กรุณาระบุสิ่งที่ต้องแก้ไข', { comment: 'กรุณาระบุสิ่งที่ต้องแก้ไข' });
    var reviewerName = personName(own(context)) || context.user.displayName || context.user.username;
    var saved = SheetRepository.update('ReportReviews', review.id, { status: decision, comment: comment, reviewerUserId: context.user.id,
      reviewerPersonnelId: own(context), reviewerName: reviewerName, reviewedAt: Core.nowIso() }, payload.version || review.version, context.user.id);
    AuditService.write(decision === SIGNED ? 'REPORT_SIGN' : 'REPORT_RETURN', 'ReportReviews', review.id, {}, context.user.id);
    var kind = KINDS[review.entity];
    if (decision === SIGNED && kind && kind.onSigned) {
      var record = SheetRepository.findById(entityOf(review.entity).sheet, review.recordId);
      if (record) kind.onSigned(record, context.user.id);
    }
    var submitter = SheetRepository.findById('Users', review.submitterUserId);
    var url = openUrl(review.id);
    var mailed = mail(submitter && /@/.test(String(submitter.email || '')) ? String(submitter.email).trim() : '',
      (decision === SIGNED ? 'ผู้บริหารลงนามแล้ว: ' : 'ส่งกลับแก้ไข: ') + review.title,
      'เรียน ' + (personName(review.submitterPersonnelId) || 'ผู้ส่งรายงาน') + '\n\nรายงาน: ' + review.title + '\nผลการพิจารณา: ' + decision +
      '\nโดย: ' + reviewerName + (comment ? '\nความเห็น: ' + comment : '') +
      (decision === SIGNED ? '\n\nพิมพ์เอกสารที่ลงนามแล้ว (บันทึกเป็น PDF ได้) ที่:\n' : '\n\nกรุณาแก้ไขรายงานแล้วกด “ส่งผู้บริหาร” อีกครั้ง\nเปิดรายงาน:\n') +
      (url || 'เมนู “ส่งรายงานถึงผู้บริหาร” ในระบบ'));
    return { id: saved.id, status: saved.status, mailed: mailed };
  }

  // ผู้บริหารเปิดให้พิจารณาใหม่ (เช่น ลงนามผิดรายการ)
  function reopen(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    var review = SheetRepository.findById('ReportReviews', data && data.id);
    if (!review) throw fail('NOT_FOUND', 'ไม่พบรายงานที่ส่ง');
    if (review.status === PENDING) throw fail('VALIDATION_ERROR', 'รายงานนี้ยังรอพิจารณาอยู่');
    var saved = SheetRepository.update('ReportReviews', review.id, { status: PENDING, reviewedAt: '' }, review.version, context.user.id);
    AuditService.write('REPORT_REOPEN', 'ReportReviews', review.id, {}, context.user.id);
    return { id: saved.id, status: saved.status };
  }

  return { submit: submit, statusOf: statusOf, preview: preview, list: list, get: get, decide: decide, reopen: reopen, KINDS: KINDS, PENDING: PENDING, SIGNED: SIGNED, RETURNED: RETURNED };
})();
