// นิเทศการสอน: ครูส่งขอรับการนิเทศ (แผน + วีดีโอ + เลือกแบบประเมิน) → มอบหมายผู้นิเทศ/กรรมการ → กรรมการให้คะแนนแยกคน
// → ประธานสรุปผล (คะแนน = เฉลี่ยของกรรมการที่ส่งแล้ว) พร้อมน้องบอทช่วยให้ความเห็นพัฒนาครู · และตัวช่วยเรียบเรียงบันทึก PLC 13 ประเด็น
var SupervisionService = (function () {
  'use strict';

  var TEXT_FIELDS = ['strengths', 'improvements', 'bestPractice', 'notes'];
  var FIELD_LABELS = { strengths: 'จุดเด่น', improvements: 'จุดที่ควรพัฒนา', bestPractice: 'วิธีปฏิบัติที่ดี (Best Practice)', notes: 'ข้อเสนอแนะเพื่อการพัฒนา' };
  var WAITING = 'รอมอบหมาย';
  var ASSIGNED = 'รอประเมิน';
  var SCORING = 'กำลังประเมิน';
  var DONE = 'ประเมินแล้ว';
  var COMMITTEE_KEYS = ['supervisorId', 'committee2Id', 'committee3Id', 'committee4Id', 'committee5Id'];
  var HIDDEN_RESULT = { score: '', result: '', scoresJson: '', strengths: '', improvements: '', bestPractice: '', notes: '', aiAdvice: '' };

  function levelOf(percent) {
    return percent >= 90 ? 'ดีเยี่ยม' : percent >= 80 ? 'ดีมาก' : percent >= 70 ? 'ดี' : percent >= 60 ? 'พอใช้' : 'ปรับปรุง';
  }

  function criteriaFor(formType) {
    return SheetRepository.all('SupervisionCriteria').filter(function (row) { return row.formType === formType && row.isActive !== false; })
      .sort(function (a, b) { return Number(a.sortNo) - Number(b.sortNo); })
      .map(function (row) { return { id: row.id, sortNo: row.sortNo, item: row.item, maxScore: Number(row.maxScore) || 5 }; });
  }

  function parseJson(text) {
    try { var value = JSON.parse(text || '[]'); return Array.isArray(value) ? value : []; } catch (error) { return []; }
  }
  function parseScores(row) { return parseJson(row.scoresJson); }

  function fail(code, message) { return SheetRepository.serviceError(code, message); }

  function committeeOf(row) {
    var ids = [];
    COMMITTEE_KEYS.forEach(function (key) { var id = String(row[key] || ''); if (id && ids.indexOf(id) === -1) ids.push(id); });
    return ids;
  }

  function canManage(context) { return Core.hasPermission(context.permissions, 'supervision.edit'); }
  function ownId(context) { return String(context.user.personnelId || ''); }

  // รายการก่อนรุ่นนี้ไม่มีสถานะ: ให้คะแนนแล้ว = ประเมินแล้ว
  function statusOf(row) {
    if (row.status) return row.status;
    if (row.score !== '' && row.score !== null && row.score !== undefined) return DONE;
    return row.supervisorId ? ASSIGNED : WAITING;
  }

  function loadRow(id) {
    var row = SheetRepository.findById('Supervisions', id);
    if (!row) throw fail('NOT_FOUND', 'ไม่พบรายการนิเทศ');
    return row;
  }

  function scoresOf(id) {
    return SheetRepository.all('SupervisionScores').filter(function (item) { return String(item.supervisionId) === String(id); });
  }

  // รายการเกณฑ์ของรายการนี้: ใช้ชุดที่จำไว้ตอนมอบหมาย (เกณฑ์เปลี่ยนภายหลังไม่กระทบ) ถ้าไม่มีใช้เกณฑ์ปัจจุบัน
  function templateOf(row) {
    var saved = parseScores(row);
    var items = saved.length ? saved : criteriaFor(row.formType);
    return items.map(function (item) { return { id: item.id, sortNo: item.sortNo, item: item.item, maxScore: Number(item.maxScore) || 5 }; });
  }

  function scoreMap(scoreRow) {
    var map = {};
    parseJson(scoreRow && scoreRow.scoresJson).forEach(function (item) { map[item.id] = item.score; });
    return map;
  }

  function percentOf(items) {
    var scored = items.filter(function (item) { return item.score !== '' && item.score !== null && item.score !== undefined; });
    var got = scored.reduce(function (sum, item) { return sum + Number(item.score); }, 0);
    var full = scored.reduce(function (sum, item) { return sum + Number(item.maxScore); }, 0);
    return full ? Math.round(got * 1000 / full) / 10 : '';
  }

  // คะแนนเฉลี่ยรายข้อจากกรรมการที่ส่งแล้ว
  function averageItems(template, submitted) {
    var maps = submitted.map(scoreMap);
    return template.map(function (item) {
      var values = maps.map(function (map) { return map[item.id]; })
        .filter(function (value) { return value !== '' && value !== null && value !== undefined && isFinite(Number(value)); }).map(Number);
      var avg = values.length ? Math.round(values.reduce(function (a, b) { return a + b; }, 0) * 100 / values.length) / 100 : '';
      return Object.assign({}, item, { score: avg });
    });
  }

  function names() {
    var people = EntityService.indexBy(SheetRepository.all('Personnel'));
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    return function (id) {
      var person = people[id];
      return person ? (((titles[person.titleId] || {}).name || '') + person.firstName + ' ' + person.lastName).trim() : '';
    };
  }

  function activeYearId() {
    var year = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    return year ? year.id : '';
  }

  function summarize(row, scoreIndex) {
    var scores = scoreIndex[row.id] || [];
    return { id: row.id, version: row.version, academicYearId: row.academicYearId, teacherId: row.teacherId, subjectName: row.subjectName,
      classLevel: row.classLevel, formType: row.formType, status: statusOf(row), supervisionDate: row.supervisionDate,
      supervisorId: row.supervisorId, committee: committeeOf(row), fileId: row.fileId, videoUrl: row.videoUrl, requestNote: row.requestNote,
      batchId: row.batchId, score: row.score, result: row.result, createdAt: row.createdAt,
      submitted: scores.filter(function (item) { return item.status === 'submitted'; }).length };
  }

  // ---------- ข้อมูลหน้า "นิเทศการสอน" (แท็บ ของฉัน / งานที่ต้องประเมิน / รอมอบหมาย / ทั้งหมด) ----------
  function page(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    var own = ownId(context);
    var manage = canManage(context);
    var yearId = String(payload.academicYearId || '');
    var rows = SheetRepository.all('Supervisions').filter(function (row) { return !yearId || String(row.academicYearId) === yearId; });
    var scoreIndex = {};
    SheetRepository.all('SupervisionScores').forEach(function (item) { (scoreIndex[item.supervisionId] = scoreIndex[item.supervisionId] || []).push(item); });
    var byDate = function (a, b) { return String(b.supervisionDate || b.createdAt).localeCompare(String(a.supervisionDate || a.createdAt)); };
    var mine = own ? rows.filter(function (row) { return String(row.teacherId) === own; }).map(function (row) {
      var item = summarize(row, scoreIndex);
      return item.status === DONE ? item : Object.assign(item, { score: '', result: '' });
    }).sort(byDate) : [];
    var tasks = own ? rows.filter(function (row) { return statusOf(row) !== WAITING && committeeOf(row).indexOf(own) !== -1; }).map(function (row) {
      var item = summarize(row, scoreIndex);
      var my = (scoreIndex[row.id] || []).filter(function (score) { return String(score.evaluatorId) === own; })[0];
      return Object.assign(item, { myStatus: my ? my.status : '', myRole: String(row.supervisorId) === own ? 'ประธาน' : 'กรรมการ' });
    }).sort(byDate) : [];
    var forms = APP_CONFIG.SUPERVISION_FORMS.map(function (name) { return { name: name, items: criteriaFor(name).length }; });
    var plans = own ? SheetRepository.all('LessonPlans').filter(function (row) {
      return String(row.teacherId) === own && row.fileId && (!yearId || String(row.academicYearId) === yearId);
    }).map(function (row) { return { id: row.id, title: row.title, subjectName: row.subjectName, gradeLevel: row.gradeLevel, fileId: row.fileId }; }) : [];
    return { personnelId: own, linked: !!own, canManage: manage, mine: mine, tasks: tasks, forms: forms, plans: plans,
      all: manage ? rows.map(function (row) { return summarize(row, scoreIndex); }).sort(byDate) : [] };
  }

  function cleanRequest(input, errors) {
    var subjectName = String(input.subjectName || '').trim().slice(0, 150);
    if (!subjectName) errors.subjectName = 'กรุณาระบุรายวิชา';
    var classLevel = String(input.classLevel || '').trim();
    if (classLevel && APP_CONFIG.GRADE_LEVELS.indexOf(classLevel) === -1) errors.classLevel = 'กรุณาเลือกจากรายการ';
    var videoUrl = String(input.videoUrl || '').trim().slice(0, 500);
    if (videoUrl && !/^https:\/\/\S+$/i.test(videoUrl)) errors.videoUrl = 'ลิงก์ต้องขึ้นต้นด้วย https://';
    var fileId = String(input.fileId || '').trim();
    if (fileId && !SheetRepository.findByField('Files', 'fileId', fileId).length) errors.fileId = 'ไม่พบไฟล์ที่แนบ กรุณาแนบใหม่';
    return { subjectName: subjectName, classLevel: classLevel, videoUrl: videoUrl, fileId: fileId,
      requestNote: String(input.requestNote || '').trim().slice(0, 1000) };
  }

  // ครูส่งขอรับการนิเทศ: ติ๊กได้หลายแบบ ระบบสร้าง 1 รายการต่อ 1 แบบ ใช้แผน/วีดีโอชุดเดียวกัน
  function request(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var own = ownId(context);
    if (!own) throw fail('VALIDATION_ERROR', 'บัญชีของคุณยังไม่ได้ผูกกับทะเบียนบุคลากร กรุณาแจ้งผู้ดูแลระบบ');
    var payload = data || {};
    var errors = {};
    var values = cleanRequest(payload, errors);
    var forms = (payload.formTypes || []).filter(function (name, index, list) {
      return APP_CONFIG.SUPERVISION_FORMS.indexOf(name) !== -1 && list.indexOf(name) === index;
    });
    if (!forms.length) errors.formTypes = 'กรุณาเลือกแบบประเมินอย่างน้อย 1 แบบ';
    forms.forEach(function (name) { if (!criteriaFor(name).length) errors.formTypes = 'ยังไม่มีเกณฑ์ของ "' + name + '" กรุณาแจ้งผู้ดูแลระบบ'; });
    if (forms.indexOf('ตรวจแผนการจัดการเรียนรู้') !== -1 && !values.fileId) errors.fileId = 'แบบตรวจแผนต้องแนบไฟล์แผนการจัดการเรียนรู้';
    if (!values.fileId && !values.videoUrl) errors.fileId = errors.fileId || 'กรุณาแนบแผนการจัดการเรียนรู้ หรือใส่ลิงก์วีดีโอการสอน';
    var yearId = String(payload.academicYearId || activeYearId());
    if (!yearId) errors.subjectName = errors.subjectName || 'ยังไม่ได้ตั้งปีการศึกษาปัจจุบัน';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var batchId = Utilities.getUuid();
    var records = SheetRepository.insertMany('Supervisions', forms.map(function (formType) {
      return Object.assign({ academicYearId: yearId, supervisionDate: '', teacherId: own, supervisorId: '', score: '', result: '', notes: '',
        formType: formType, committee2Id: '', committee3Id: '', committee4Id: '', committee5Id: '', strengths: '', improvements: '',
        bestPractice: '', photo1FileId: '', photo2FileId: '', photo3FileId: '', scoresJson: '', status: WAITING, batchId: batchId,
        aiAdvice: '', finalizedAt: '' }, values);
    }), context.user.id);
    AuditService.write('SUPERVISION_REQUEST', 'Supervisions', batchId, { count: records.length }, context.user.id);
    try {
      NotifyService.notify('supervision-request', '📝 ครูส่งขอรับการนิเทศ\n' + names()(own) + ' · ' + values.subjectName +
        (values.classLevel ? ' ' + values.classLevel : '') + '\nแบบประเมิน: ' + forms.join(', '));
    } catch (error) { console.error('notify: ' + error.message); }
    return { ids: records.map(function (row) { return row.id; }) };
  }

  function requireOwnWaiting(context, row) {
    if (canManage(context)) return;
    if (String(row.teacherId) !== ownId(context)) throw fail('FORBIDDEN', 'แก้ไขได้เฉพาะคำขอของตนเอง');
    if (statusOf(row) !== WAITING) throw fail('VALIDATION_ERROR', 'คำขอนี้มอบหมายกรรมการแล้ว แก้ไขหรือยกเลิกไม่ได้ กรุณาติดต่อผู้รับผิดชอบงานนิเทศ');
  }

  function updateRequest(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    var row = loadRow(payload.id);
    requireOwnWaiting(context, row);
    var errors = {};
    var values = cleanRequest(payload, errors);
    if (!values.fileId && !values.videoUrl) errors.fileId = 'กรุณาแนบแผนการจัดการเรียนรู้ หรือใส่ลิงก์วีดีโอการสอน';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var saved = SheetRepository.update('Supervisions', row.id, values, payload.version || row.version, context.user.id);
    return { id: saved.id, version: saved.version };
  }

  function cancelRequest(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var row = loadRow(data && data.id);
    requireOwnWaiting(context, row);
    SheetRepository.softDelete('Supervisions', row.id, row.version, context.user.id);
    AuditService.write('SUPERVISION_CANCEL', 'Supervisions', row.id, {}, context.user.id);
    return { id: row.id };
  }

  // มอบหมายผู้นิเทศ (ประธาน) กรรมการ และวันนิเทศ ให้หลายรายการพร้อมกันได้
  function assign(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.edit');
    var payload = data || {};
    var errors = {};
    var date = String(payload.supervisionDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.supervisionDate = 'กรุณาระบุวันนิเทศ';
    var people = COMMITTEE_KEYS.map(function (key) { return String(payload[key] || '').trim(); });
    if (!people[0]) errors.supervisorId = 'กรุณาเลือกผู้นิเทศ (ประธาน)';
    people.forEach(function (id, index) {
      if (!id) return;
      if (!SheetRepository.findById('Personnel', id)) errors[COMMITTEE_KEYS[index]] = 'ไม่พบบุคลากร';
      else if (people.slice(0, index).indexOf(id) !== -1) errors[COMMITTEE_KEYS[index]] = 'เลือกซ้ำกัน';
    });
    var ids = (payload.ids || []).map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index; }).slice(0, 100);
    if (!ids.length) errors.supervisorId = errors.supervisorId || 'กรุณาเลือกรายการที่จะมอบหมาย';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var rows = ids.map(loadRow);
    rows.forEach(function (row) {
      if (people.indexOf(String(row.teacherId)) !== -1) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ผู้นิเทศ/กรรมการต้องไม่ใช่ครูผู้รับการนิเทศ', { supervisorId: 'ต้องไม่ใช่ครูผู้รับการนิเทศ' });
      var status = statusOf(row);
      if (status === DONE) throw fail('VALIDATION_ERROR', 'มีรายการที่สรุปผลแล้ว มอบหมายใหม่ไม่ได้');
      var scorers = scoresOf(row.id).map(function (item) { return String(item.evaluatorId); });
      if (scorers.some(function (id) { return people.indexOf(id) === -1; })) {
        throw fail('VALIDATION_ERROR', 'มีกรรมการให้คะแนนรายการนี้ไปแล้ว จึงนำคนนั้นออกจากคณะกรรมการไม่ได้');
      }
      if (!templateOf(row).length) throw fail('VALIDATION_ERROR', 'ยังไม่มีเกณฑ์ของ "' + row.formType + '" กรุณาเพิ่มที่เมนู “เกณฑ์การนิเทศ”');
    });
    var name = names();
    rows.forEach(function (row) {
      var changes = { supervisionDate: date, status: scoresOf(row.id).length ? SCORING : ASSIGNED,
        scoresJson: parseScores(row).length ? row.scoresJson : JSON.stringify(templateOf(row)) };
      COMMITTEE_KEYS.forEach(function (key, index) { changes[key] = people[index]; });
      SheetRepository.update('Supervisions', row.id, changes, row.version, context.user.id);
    });
    AuditService.write('SUPERVISION_ASSIGN', 'Supervisions', ids.join(',').slice(0, 200), { count: rows.length }, context.user.id);
    try {
      NotifyService.notify('supervision-assign', '📋 มอบหมายนิเทศการสอน ' + rows.length + ' รายการ · วันที่ ' + date +
        '\nผู้รับการนิเทศ: ' + rows.map(function (row) { return name(row.teacherId); }).filter(function (value, index, list) { return list.indexOf(value) === index; }).join(', ') +
        '\nผู้นิเทศ: ' + people.filter(Boolean).map(name).join(', ') + '\nกรรมการเข้าไปให้คะแนนที่เมนู “นิเทศการสอน” แท็บ “งานที่ต้องประเมิน”');
    } catch (error) { console.error('notify: ' + error.message); }
    return { count: rows.length };
  }

  function roleOf(context, row) {
    var own = ownId(context);
    return {
      own: own,
      chair: !!own && String(row.supervisorId) === own,
      member: !!own && committeeOf(row).indexOf(own) !== -1,
      teacher: !!own && String(row.teacherId) === own,
      manage: canManage(context)
    };
  }

  // เปิดรายการ: กรรมการได้แบบให้คะแนนของตน · ประธาน/ผู้บริหารเห็นคะแนนทุกคน · ครูเห็นผลเฉลี่ยของตนเมื่อสรุปผลแล้ว
  function getScoring(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var row = loadRow(data && data.id);
    var role = roleOf(context, row);
    var status = statusOf(row);
    if (!role.manage && !role.member && !role.teacher) throw fail('FORBIDDEN', 'คุณไม่ได้เกี่ยวข้องกับรายการนิเทศนี้');
    var resultOnly = !role.manage && !role.member;
    if (resultOnly && status !== DONE) throw fail('VALIDATION_ERROR', 'ผลการนิเทศจะแสดงเมื่อประธานกรรมการสรุปผลแล้ว');
    var template = templateOf(row);
    var scores = scoresOf(row.id);
    var mine = scores.filter(function (item) { return String(item.evaluatorId) === role.own; })[0] || null;
    var submitted = scores.filter(function (item) { return item.status === 'submitted'; });
    var seeAll = role.manage || role.chair || (mine && mine.status === 'submitted') || status === DONE;
    var myMap = scoreMap(mine);
    var average = seeAll ? averageItems(template, submitted) : null;
    var name = names();
    return {
      supervision: resultOnly || seeAll ? row : Object.assign({}, row, HIDDEN_RESULT),
      formType: row.formType, status: status, forms: APP_CONFIG.SUPERVISION_FORMS,
      items: template.map(function (item) { return Object.assign({}, item, { score: myMap[item.id] === undefined ? '' : myMap[item.id] }); }),
      mine: mine ? { status: mine.status, comment: mine.comment, score: mine.score } : null,
      role: { chair: role.chair, member: role.member, teacher: role.teacher, manage: role.manage },
      canScore: role.member && (status === ASSIGNED || status === SCORING),
      canSummarize: (role.chair || role.manage) && status !== WAITING,
      canReopen: role.manage && status === DONE,
      average: average, averagePercent: average ? percentOf(average) : '',
      committee: committeeOf(row).map(function (id) {
        var item = scores.filter(function (score) { return String(score.evaluatorId) === id; })[0];
        return { personnelId: id, name: name(id), chair: id === String(row.supervisorId), status: item ? item.status : '' };
      }),
      evaluators: seeAll && !resultOnly ? submitted.map(function (item) {
        return { personnelId: item.evaluatorId, name: name(item.evaluatorId), score: item.score, comment: item.comment, scores: scoreMap(item) };
      }) : []
    };
  }

  // คำนวณผลรวมของรายการจากคะแนนกรรมการที่ส่งแล้ว (เรียกหลังมีการเปลี่ยนคะแนน)
  function refresh(row, actorId, extra) {
    for (var attempt = 0; attempt < 2; attempt += 1) {
      var current = attempt ? loadRow(row.id) : row;
      var submitted = scoresOf(current.id).filter(function (item) { return item.status === 'submitted'; });
      var average = averageItems(templateOf(current), submitted);
      var percent = submitted.length ? percentOf(average) : '';
      var changes = Object.assign({ score: percent, result: percent === '' ? '' : levelOf(percent),
        scoresJson: JSON.stringify(average) }, extra || {});
      try { return SheetRepository.update('Supervisions', current.id, changes, current.version, actorId); } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt) throw error;
      }
    }
  }

  function saveMyScore(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    var row = loadRow(payload.id);
    var role = roleOf(context, row);
    if (!role.member) throw fail('FORBIDDEN', 'ให้คะแนนได้เฉพาะรายการที่คุณเป็นผู้นิเทศหรือกรรมการ');
    var status = statusOf(row);
    if (status === DONE) throw fail('VALIDATION_ERROR', 'ประธานสรุปผลแล้ว แก้ไขคะแนนไม่ได้');
    if (status === WAITING) throw fail('VALIDATION_ERROR', 'รายการนี้ยังไม่ได้มอบหมาย');
    var template = templateOf(row);
    var input = payload.scores || {};
    var problems = [];
    var items = template.map(function (item) {
      var raw = input[item.id];
      var score = raw === '' || raw === null || raw === undefined ? '' : Number(raw);
      if (score !== '' && (!isFinite(score) || score < 0 || score > item.maxScore)) problems.push(item.item + ': คะแนนต้องอยู่ระหว่าง 0–' + item.maxScore);
      return { id: item.id, score: score };
    });
    if (problems.length) throw fail('VALIDATION_ERROR', problems.slice(0, 5).join('\n'));
    var submit = payload.submit === true;
    if (submit && items.some(function (item) { return item.score === ''; })) throw fail('VALIDATION_ERROR', 'กรุณาให้คะแนนให้ครบทุกข้อก่อนส่ง');
    var withMax = items.map(function (item, index) { return { id: item.id, score: item.score, maxScore: template[index].maxScore }; });
    var values = { supervisionId: row.id, evaluatorId: role.own, scoresJson: JSON.stringify(items), score: percentOf(withMax),
      comment: String(payload.comment || '').trim().slice(0, 3000), status: submit ? 'submitted' : 'draft', submittedAt: submit ? Core.nowIso() : '' };
    var mine = scoresOf(row.id).filter(function (item) { return String(item.evaluatorId) === role.own; })[0];
    if (mine && mine.status === 'submitted' && !submit) values.status = 'submitted';
    if (mine) SheetRepository.update('SupervisionScores', mine.id, values, mine.version, context.user.id);
    else SheetRepository.insert('SupervisionScores', values, context.user.id);
    var saved = refresh(row, context.user.id, { status: SCORING });
    var all = scoresOf(row.id);
    var done = all.filter(function (item) { return item.status === 'submitted'; }).length;
    var total = committeeOf(row).length;
    if (submit && done === total) {
      try { NotifyService.notify('supervision-assign', '✅ กรรมการให้คะแนนนิเทศครบ ' + total + ' คนแล้ว (' + row.formType + ' · ' + (row.subjectName || '-') + ')\nประธานกรรมการเข้าไปสรุปผลได้ที่เมนู “นิเทศการสอน”'); } catch (error) { console.error('notify: ' + error.message); }
    }
    return { status: values.status, submitted: done, total: total, version: saved.version };
  }

  // ประธาน/ผู้บริหาร: เขียนสรุป (บันทึกร่าง) หรือกดสรุปผล
  function summarizeRow(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    var row = loadRow(payload.id);
    var role = roleOf(context, row);
    if (!role.chair && !role.manage) throw fail('FORBIDDEN', 'สรุปผลได้เฉพาะผู้นิเทศ (ประธานกรรมการ) หรือผู้บริหาร');
    var status = statusOf(row);
    if (status === WAITING) throw fail('VALIDATION_ERROR', 'รายการนี้ยังไม่ได้มอบหมาย');
    if (status === DONE && !role.manage) throw fail('VALIDATION_ERROR', 'สรุปผลแล้ว ถ้าต้องแก้ไขกรุณาให้ผู้บริหารเปิดแก้ไข');
    var extra = {};
    TEXT_FIELDS.forEach(function (key) { if (payload[key] !== undefined) extra[key] = String(payload[key] || '').trim().slice(0, 3000); });
    if (payload.aiAdvice !== undefined) extra.aiAdvice = String(payload.aiAdvice || '').trim().slice(0, 6000);
    if (payload.final === true) {
      if (!scoresOf(row.id).some(function (item) { return item.status === 'submitted'; })) throw fail('VALIDATION_ERROR', 'ยังไม่มีกรรมการส่งคะแนน');
      extra.status = DONE;
      extra.finalizedAt = Core.nowIso();
    }
    var saved = refresh(row, context.user.id, extra);
    AuditService.write(payload.final === true ? 'SUPERVISION_FINALIZE' : 'SUPERVISION_SUMMARY', 'Supervisions', row.id, {}, context.user.id);
    return { id: saved.id, version: saved.version, status: statusOf(saved), score: saved.score, result: saved.result };
  }

  function reopen(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.edit');
    var row = loadRow(data && data.id);
    if (statusOf(row) !== DONE) throw fail('VALIDATION_ERROR', 'รายการนี้ยังไม่ได้สรุปผล');
    var saved = SheetRepository.update('Supervisions', row.id, { status: scoresOf(row.id).length ? SCORING : ASSIGNED, finalizedAt: '' },
      row.version, context.user.id);
    AuditService.write('SUPERVISION_REOPEN', 'Supervisions', row.id, {}, context.user.id);
    return { id: saved.id, version: saved.version };
  }

  // ---------- น้องบอท: ความเห็นพัฒนาครู ----------
  function aiFeature(context) { return AiService.pickFeature(context, ['supervision', 'bot']); }

  function recentLogs(teacherId, subjectName) {
    var logs = SheetRepository.all('TeachingLogs').filter(function (row) { return String(row.teacherId) === String(teacherId); })
      .sort(function (a, b) { return String(b.teachDate).localeCompare(String(a.teachDate)); });
    var same = logs.filter(function (row) { return subjectName && row.subjectName === subjectName; });
    return (same.length ? same : logs).slice(0, 3).map(function (row) {
      return { date: row.teachDate, topic: row.topic, method: String(row.teachingMethod || '').slice(0, 400),
        passed: row.studentsTotal ? row.studentsPassed + '/' + row.studentsTotal : '', problems: String(row.problems || '').slice(0, 400),
        nextSteps: String(row.nextSteps || '').slice(0, 300) };
    });
  }

  function adviceInput(row) {
    var submitted = scoresOf(row.id).filter(function (item) { return item.status === 'submitted'; });
    var average = averageItems(templateOf(row), submitted).filter(function (item) { return item.score !== ''; });
    var ratio = function (item) { return Number(item.score) / (Number(item.maxScore) || 5); };
    var sorted = average.slice().sort(function (a, b) { return ratio(a) - ratio(b); });
    return {
      แบบประเมิน: row.formType, รายวิชา: row.subjectName || '-', ระดับชั้น: row.classLevel || '-',
      ร้อยละเฉลี่ย: percentOf(average), ระดับผล: average.length ? levelOf(percentOf(average)) : '',
      จำนวนกรรมการที่ส่งคะแนน: submitted.length,
      คะแนนรายข้อเรียงจากต่ำไปสูง: sorted.map(function (item) { return item.item + ' = ' + item.score + '/' + item.maxScore; }),
      ความเห็นกรรมการ: submitted.filter(function (item) { return item.comment; }).map(function (item, index) { return 'กรรมการ ' + (index + 1) + ': ' + String(item.comment).slice(0, 600); }),
      สรุปของประธาน: TEXT_FIELDS.filter(function (key) { return row[key]; }).map(function (key) { return FIELD_LABELS[key] + ': ' + String(row[key]).slice(0, 500); }),
      บันทึกหลังการสอนล่าสุด: recentLogs(row.teacherId, row.subjectName)
    };
  }

  var ADVICE_PROMPT = 'คุณคือ "น้องวิชาการ" ศึกษานิเทศก์ผู้เชี่ยวชาญการพัฒนาครูในโรงเรียนไทย ใช้ผลการนิเทศที่ให้มาเขียนความเห็นเพื่อพัฒนาครู ' +
    'ภาษาไทยสุภาพ เป็นกันเอง สร้างกำลังใจ ใช้ได้จริงในโรงเรียน อ้างอิงเฉพาะข้อมูลที่ให้มา ห้ามแต่งข้อเท็จจริงหรือตัวเลขเพิ่ม ไม่ต้องทักทาย ไม่ใส่ชื่อบุคคล ' +
    'เขียน 4 หัวข้อตามนี้ (ใช้หัวข้อตามนี้ทุกครั้ง):\n' +
    '1. จุดแข็ง — 2–4 ข้อ อ้างอิงข้อที่ได้คะแนนสูง\n' +
    '2. สิ่งที่ควรพัฒนาก่อน — 2–4 ข้อ เรียงตามความสำคัญ อ้างอิงข้อที่ได้คะแนนต่ำและความเห็นกรรมการ\n' +
    '3. ปรับการสอนแบบ Active Learning — 2–3 ข้อ เขียนเป็น "เดิม → ปรับเป็น" ระบุรูปแบบ Active Learning ที่ใช้ (เช่น Think-Pair-Share, จิ๊กซอว์, 5E, โครงงาน, เกม/สถานการณ์จำลอง) ทำได้ในคาบถัดไป\n' +
    '4. แผนพัฒนาตนเอง 1 ภาคเรียน — ตาราง/รายการ: ช่วงเวลา · กิจกรรม · ร่องรอยหลักฐาน · ผู้ช่วย/ผู้ติดตาม (3–5 แถว เช่น เข้ากลุ่ม PLC, สังเกตการสอนเพื่อน, ทดลองใช้แล้วบันทึกหลังสอน)\n' +
    'ความยาวรวมไม่เกิน 450 คำ';

  function aiAdvice(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var row = loadRow(data && data.id);
    var role = roleOf(context, row);
    if (!role.chair && !role.manage) throw fail('FORBIDDEN', 'ใช้ได้เฉพาะผู้นิเทศ (ประธานกรรมการ) หรือผู้บริหาร');
    var input = adviceInput(row);
    if (!input.จำนวนกรรมการที่ส่งคะแนน) throw fail('VALIDATION_ERROR', 'ยังไม่มีกรรมการส่งคะแนน น้องบอทจึงยังให้ความเห็นไม่ได้');
    return { text: AiService.run(context, aiFeature(context), ADVICE_PROMPT,
      [{ role: 'user', text: 'ผลการนิเทศ (JSON):\n' + JSON.stringify(input) }], { maxTokens: 1800 }).text };
  }

  // AI ช่วยร่างทีละช่อง (จุดเด่น/จุดที่ควรพัฒนา/...) จากคะแนนเฉลี่ย
  function aiDraft(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    var field = FIELD_LABELS[payload.field] ? payload.field : 'notes';
    var row = loadRow(payload.id);
    var role = roleOf(context, row);
    if (!role.chair && !role.manage) throw fail('FORBIDDEN', 'ใช้ได้เฉพาะผู้นิเทศ (ประธานกรรมการ) หรือผู้บริหาร');
    var input = adviceInput(row);
    if (!input.จำนวนกรรมการที่ส่งคะแนน) throw fail('VALIDATION_ERROR', 'ยังไม่มีกรรมการส่งคะแนน');
    if (String(payload.existing || '').trim()) input.ข้อความที่ร่างไว้ = String(payload.existing).slice(0, 1500);
    var system = 'คุณคือผู้ช่วยคณะกรรมการนิเทศการจัดการเรียนรู้ในโรงเรียนไทย ช่วยร่างข้อความหัวข้อ "' + FIELD_LABELS[field] + '" ในแบบบันทึกการนิเทศ ' +
      'เขียนภาษาไทยสุภาพ เป็นทางการ สร้างกำลังใจ อ้างอิงเฉพาะข้อมูลที่ให้มา ห้ามแต่งข้อเท็จจริงเพิ่ม ความยาวไม่เกิน 4 ประโยค ไม่ต้องใส่หัวข้อ ไม่ใส่ชื่อบุคคล';
    return { text: AiService.run(context, aiFeature(context), system, [{ role: 'user', text: JSON.stringify(input) }], { maxTokens: 600 }).text };
  }

  // ---------- ภาพรวมรายคน: ผลนิเทศทุกครั้ง ด้านที่ต่ำซ้ำ และ PLC ที่เข้าร่วม ----------
  function overviewData(teacherId) {
    var rows = SheetRepository.all('Supervisions').filter(function (row) { return String(row.teacherId) === String(teacherId) && statusOf(row) === DONE; })
      .sort(function (a, b) { return String(a.supervisionDate).localeCompare(String(b.supervisionDate)); });
    var years = EntityService.indexBy(SheetRepository.all('AcademicYears'));
    var items = {};
    rows.forEach(function (row) {
      parseScores(row).forEach(function (item) {
        if (item.score === '' || item.score === null || item.score === undefined) return;
        var entry = items[item.item] || (items[item.item] = { item: item.item, total: 0, times: 0, low: 0 });
        var ratio = Number(item.score) / (Number(item.maxScore) || 5);
        entry.total += ratio;
        entry.times += 1;
        if (ratio < 0.7) entry.low += 1;
      });
    });
    var list = Object.keys(items).map(function (key) {
      var entry = items[key];
      return { item: entry.item, percent: Math.round(entry.total * 1000 / entry.times) / 10, times: entry.times, low: entry.low };
    });
    var userIds = SheetRepository.all('Users').filter(function (user) { return String(user.personnelId) === String(teacherId); })
      .map(function (user) { return String(user.id); });
    var plc = SheetRepository.all('PlcRecords').filter(function (row) {
      return String(row.memberIds || '').split(',').indexOf(String(teacherId)) !== -1 || userIds.indexOf(String(row.createdBy)) !== -1;
    }).sort(function (a, b) { return String(b.meetingDate).localeCompare(String(a.meetingDate)); })
      .map(function (row) { return { meetingDate: row.meetingDate, teamName: row.teamName, topic: row.topic, isSuccess: row.isSuccess || '' }; });
    return {
      teacherId: teacherId,
      records: rows.map(function (row) {
        return { id: row.id, date: row.supervisionDate, year: (years[row.academicYearId] || {}).year || '', formType: row.formType,
          subjectName: row.subjectName, score: row.score, result: row.result };
      }),
      weak: list.filter(function (item) { return item.percent < 70; }).sort(function (a, b) { return a.percent - b.percent || b.low - a.low; }).slice(0, 8),
      strong: list.filter(function (item) { return item.percent >= 80; }).sort(function (a, b) { return b.percent - a.percent; }).slice(0, 5),
      plc: plc.slice(0, 20),
      teachingLogs: SheetRepository.all('TeachingLogs').filter(function (row) { return String(row.teacherId) === String(teacherId); }).length
    };
  }

  function requireOverview(context, teacherId) {
    if (!teacherId) throw fail('VALIDATION_ERROR', 'กรุณาเลือกครู');
    if (!canManage(context) && String(teacherId) !== ownId(context)) throw fail('FORBIDDEN', 'ดูภาพรวมได้เฉพาะของตนเอง');
  }

  function overview(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var teacherId = String((data && data.teacherId) || '');
    requireOverview(context, teacherId);
    return overviewData(teacherId);
  }

  function aiOverview(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var teacherId = String((data && data.teacherId) || '');
    requireOverview(context, teacherId);
    var info = overviewData(teacherId);
    if (!info.records.length) throw fail('VALIDATION_ERROR', 'ครูคนนี้ยังไม่มีผลนิเทศที่สรุปแล้ว');
    var input = { ผลนิเทศแต่ละครั้ง: info.records.map(function (row) { return row.date + ' · ' + row.formType + ' · ' + (row.subjectName || '-') + ' · ร้อยละ ' + row.score + ' (' + row.result + ')'; }),
      ด้านที่ต่ำ: info.weak.map(function (item) { return item.item + ' เฉลี่ยร้อยละ ' + item.percent + ' (ต่ำกว่า 70% ' + item.low + '/' + item.times + ' ครั้ง)'; }),
      ด้านที่เด่น: info.strong.map(function (item) { return item.item + ' ร้อยละ ' + item.percent; }),
      PLC_ที่เข้าร่วม: info.plc.map(function (row) { return row.meetingDate + ' ' + row.topic + (row.isSuccess ? ' (' + row.isSuccess + ')' : ''); }),
      จำนวนบันทึกหลังการสอน: info.teachingLogs };
    var system = 'คุณคือ "น้องวิชาการ" ศึกษานิเทศก์ผู้เชี่ยวชาญการพัฒนาครู วิเคราะห์ผลนิเทศหลายครั้งของครู 1 คน ภาษาไทยสุภาพ สร้างกำลังใจ อ้างอิงเฉพาะข้อมูลที่ให้มา ไม่ใส่ชื่อบุคคล ' +
      'เขียน 4 หัวข้อ: 1. แนวโน้ม (ดีขึ้น/คงที่/ลดลง ด้านไหน) 2. ด้านที่ต่ำซ้ำและสาเหตุที่น่าจะเป็น 3. หัวข้อ PLC ที่ควรตั้งกลุ่มหรือเข้าร่วม 2–3 หัวข้อ และการอบรม/ศึกษาเพิ่มเติม 2–3 เรื่อง ' +
      '4. เป้าหมายการพัฒนาภาคเรียนหน้า 3 ข้อที่วัดผลได้ ความยาวไม่เกิน 400 คำ';
    return { text: AiService.run(context, aiFeature(context), system, [{ role: 'user', text: JSON.stringify(input) }], { maxTokens: 1600 }).text };
  }

  // ---------- บันทึก PLC: น้องบอทช่วยเรียบเรียงข้อความที่ครูพิมพ์ไว้ ----------
  var PLC_FIELDS = [['problem', '1. สภาพปัญหา'], ['objective', '2. วัตถุประสงค์'], ['cause', '3. สาเหตุของปัญหา'], ['knowledge', '4. ความรู้/หลักการที่ใช้'],
    ['plan', '5. กิจกรรมดำเนินงาน'], ['result', '6. ผลที่ได้รับ'], ['otherKnowledge', '7. ความรู้อื่น ๆ ที่ได้'], ['application', '8. การประยุกต์ใช้'],
    ['obstacle', '9. อุปสรรค'], ['goodPractice', '10. ข้อควรปฏิบัติ'], ['reflection', '11. แนวทางปรับปรุง'], ['successReason', '13. เหตุผลประกอบ']];

  function plcPolish(token, data) {
    var context = AuthService.requirePermission(token, 'plc.edit');
    var values = (data && data.values) || {};
    var filled = PLC_FIELDS.filter(function (pair) { return String(values[pair[0]] || '').trim(); });
    if (!filled.length) throw fail('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความอย่างน้อย 1 ประเด็นก่อน');
    var header = 'ประเด็น PLC: ' + String(values.topic || '-').slice(0, 300);
    var body = filled.map(function (pair) { return '[' + pair[0] + '] ' + pair[1] + ': ' + String(values[pair[0]]).slice(0, 1500); }).join('\n');
    var system = 'คุณช่วยครูเรียบเรียงแบบบันทึกกิจกรรมชุมชนการเรียนรู้ทางวิชาชีพ (PLC) ให้เป็นภาษาราชการที่ชัดเจน กระชับ ' +
      'คงความหมายและข้อเท็จจริงเดิมทุกอย่าง ห้ามเพิ่มตัวเลข ผลลัพธ์ หรือเหตุการณ์ที่ครูไม่ได้เขียน ไม่ใส่ชื่อบุคคล ' +
      'ตอบเฉพาะประเด็นที่ได้รับ บรรทัดละประเด็น ขึ้นต้นด้วยรหัสในวงเล็บเหลี่ยมเหมือนต้นฉบับ เช่น [problem] ข้อความ ห้ามขึ้นบรรทัดใหม่ภายในประเด็น';
    var text = AiService.run(context, AiService.pickFeature(context, ['supervision', 'bot']), system,
      [{ role: 'user', text: header + '\n' + body }], { maxTokens: 2000 }).text;
    var result = {};
    var keys = filled.map(function (pair) { return pair[0]; });
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var match = line.match(/^\s*\[([a-zA-Z]+)\]\s*(?:[0-9.]+\s*[^:：]*[:：])?\s*(.+)$/);
      if (match && keys.indexOf(match[1]) !== -1 && match[2].trim()) result[match[1]] = match[2].trim().slice(0, 3000);
    });
    if (!Object.keys(result).length) throw fail('AI_FAILED', 'น้องบอทตอบกลับในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่');
    return { values: result };
  }

  // ---------- บริบทให้น้องบอทในหน้า "นิเทศการสอน" ----------
  function botContext(token, data) {
    var context = AuthService.requirePermission(token, 'supervision.view');
    var payload = data || {};
    if (payload.supervisionId) {
      var row = SheetRepository.findById('Supervisions', payload.supervisionId);
      var role = row ? roleOf(context, row) : null;
      var allowed = role && (role.manage || role.chair || (role.teacher && statusOf(row) === DONE) ||
        (role.member && scoresOf(row.id).some(function (item) { return String(item.evaluatorId) === role.own && item.status === 'submitted'; })));
      if (allowed) {
        var input = adviceInput(row);
        input.สถานะ = statusOf(row);
        if (row.aiAdvice) input.ความเห็นพัฒนาครูที่บันทึกไว้ = String(row.aiAdvice).slice(0, 2000);
        return { title: 'นิเทศการสอน', total: 1, shown: 1,
          text: 'หน้า: นิเทศการสอน (ผู้ใช้กำลังเปิดผลการนิเทศ 1 รายการ ไม่ระบุชื่อครู)\nข้อมูลรายการนี้ (JSON):\n' + JSON.stringify(input) };
      }
    }
    var info = page(token, { academicYearId: payload.academicYearId });
    var count = function (list) {
      return list.reduce(function (result, item) { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});
    };
    var summary = info.canManage ? { จำนวนตามสถานะ: count(info.all), แบบประเมิน: info.forms }
      : { คำขอของฉันตามสถานะ: count(info.mine), งานที่ฉันต้องประเมิน: info.tasks.filter(function (item) { return item.myStatus !== 'submitted' && item.status !== DONE; }).length };
    return { title: 'นิเทศการสอน', total: null, shown: null,
      text: 'หน้า: นิเทศการสอน (ขั้นตอน: ครูส่งขอรับการนิเทศ → ผู้บริหารมอบหมายผู้นิเทศ/กรรมการ → กรรมการให้คะแนนแยกคน → ประธานสรุปผล)\n' +
        'สรุป (JSON): ' + JSON.stringify(summary) + '\n(ถ้าผู้ใช้ต้องการให้วิเคราะห์ผลของครูรายคน ให้แนะนำให้เปิดรายการนั้นก่อน)' };
  }

  // ---------- ย้ายข้อมูลรุ่นก่อน: คะแนนชุดเดียวในรายการ → คะแนนของผู้นิเทศ 1 คน และตั้งสถานะ ----------
  function migrateLegacy() {
    var rows = SheetRepository.all('Supervisions', { includeDeleted: true });
    if (!rows.some(function (row) { return !row.status; })) return 0;
    var existing = {};
    SheetRepository.all('SupervisionScores', { includeDeleted: true }).forEach(function (item) { existing[item.supervisionId] = true; });
    var scores = [];
    var updated = rows.map(function (row) {
      if (row.status) return row;
      var status = statusOf(row);
      var items = parseScores(row);
      if (status === DONE && row.supervisorId && items.length && !existing[row.id]) {
        scores.push({ supervisionId: row.id, evaluatorId: row.supervisorId,
          scoresJson: JSON.stringify(items.map(function (item) { return { id: item.id, score: item.score }; })),
          score: row.score, comment: '', status: 'submitted', submittedAt: row.updatedAt || '' });
      }
      return Object.assign({}, row, { status: status, finalizedAt: status === DONE ? (row.updatedAt || '') : '' });
    });
    SheetRepository.replaceTablesAtomically({ Supervisions: updated });
    if (scores.length) SheetRepository.insertMany('SupervisionScores', scores, 'system');
    return updated.length;
  }

  return { page: page, request: request, updateRequest: updateRequest, cancelRequest: cancelRequest, assign: assign,
    getScoring: getScoring, saveMyScore: saveMyScore, summarize: summarizeRow, reopen: reopen, aiAdvice: aiAdvice, aiDraft: aiDraft,
    overview: overview, aiOverview: aiOverview, plcPolish: plcPolish, botContext: botContext, migrateLegacy: migrateLegacy,
    committeeOf: committeeOf, statusOf: statusOf, levelOf: levelOf, criteriaFor: criteriaFor };
})();
