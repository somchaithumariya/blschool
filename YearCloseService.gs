/**
 * ปิดปีการศึกษา: เก็บถาวรข้อมูลทั้งปีเป็นไฟล์ Google Sheet ใน Drive แล้วย้ายข้อมูลที่โตเร็วออกจากตารางหลัก
 * (การมาเรียนรายคาบ ประวัติการใช้งานเก่า เซสชันที่หมดอายุ) พร้อมเลื่อนชั้นนักเรียนไปปีการศึกษาถัดไป
 * และคัดลอกห้องเรียน/นักเรียนไปภาคเรียนถัดไป
 */
var YearCloseService = (function () {
  'use strict';

  var PERMISSION = 'yearClose.manage';
  var ACTIVE = ['', 'กำลังศึกษา'];

  function termsOf(year) {
    return SheetRepository.all('AcademicYears').filter(function (row) { return String(row.year) === String(year); })
      .sort(function (a, b) { return String(a.term).localeCompare(String(b.term), 'th', { numeric: true }); });
  }

  function idSet(rows) {
    return rows.reduce(function (set, row) { set[String(row.id)] = true; return set; }, {});
  }

  function nextLevel(level) {
    var levels = APP_CONFIG.GRADE_LEVELS;
    var index = levels.indexOf(level);
    return index === -1 || index === levels.length - 1 ? '' : levels[index + 1];
  }

  function highestLevel(homerooms) {
    var levels = APP_CONFIG.GRADE_LEVELS;
    return homerooms.reduce(function (best, room) {
      return levels.indexOf(room.gradeLevel) > levels.indexOf(best) ? room.gradeLevel : best;
    }, '');
  }

  function isActiveEnrollment(row) { return ACTIVE.indexOf(String(row.status || '')) !== -1; }

  function cutoffOf(terms) {
    return terms.reduce(function (latest, term) { return String(term.endsAt || '') > latest ? String(term.endsAt) : latest; }, '');
  }

  // แผนการเลื่อนชั้น: ห้องต้นทาง (ภาคเรียนสุดท้ายของปี) -> ห้องชั้นถัดไปในปีใหม่ หรือจบการศึกษา
  function promotionPlan(sourceTerm, finalGrade) {
    if (!sourceTerm) return { rooms: [], promoted: 0, graduated: 0 };
    var homerooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(sourceTerm.id); });
    var enrollments = SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.academicYearId) === String(sourceTerm.id) && isActiveEnrollment(row);
    });
    var promoted = 0;
    var graduated = 0;
    var rooms = homerooms.sort(function (a, b) {
      var levels = APP_CONFIG.GRADE_LEVELS;
      return levels.indexOf(a.gradeLevel) - levels.indexOf(b.gradeLevel) || String(a.roomName).localeCompare(String(b.roomName), 'th', { numeric: true });
    }).map(function (room) {
      var count = enrollments.filter(function (row) { return String(row.homeroomId) === String(room.id); }).length;
      var graduates = room.gradeLevel === finalGrade || !nextLevel(room.gradeLevel);
      if (graduates) graduated += count; else promoted += count;
      return { id: room.id, gradeLevel: room.gradeLevel, roomName: room.roomName, students: count,
        target: graduates ? '' : nextLevel(room.gradeLevel) + '/' + room.roomName, graduates: graduates };
    });
    return { rooms: rooms, promoted: promoted, graduated: graduated };
  }

  // ---------- ข้อมูลแต่ละเรื่องที่เลือกได้ว่าจะ "เก็บไว้ในระบบ" หรือ "ย้ายออก" (ทุกเรื่องมีสำเนาในไฟล์เก็บถาวรเสมอ) ----------
  var GROUPS = [
    ['rooms', 'ห้องเรียนและทะเบียนรายปี', 'fa-school'],
    ['learning', 'ผลการเรียนและเวลาเรียน', 'fa-book'],
    ['care', 'ดูแลช่วยเหลือนักเรียน', 'fa-hand-holding-heart'],
    ['safety', 'ความปลอดภัย', 'fa-shield-heart'],
    ['quality', 'นิเทศ ประเมิน และประกันคุณภาพ', 'fa-clipboard-check'],
    ['strategy', 'แผนกลยุทธ์ SWOT และโครงการ', 'fa-chess'],
    ['system', 'บันทึกของระบบ', 'fa-server']
  ];
  var GROUP_OF = {
    'homerooms': 'rooms', 'student-enrollments': 'rooms', 'personnel-years': 'rooms', 'approval-positions': 'rooms', 'calendar': 'rooms',
    'timetable': 'rooms', 'teaching-load': 'rooms',
    'porpor5': 'learning', 'attendance-sessions': 'learning', 'student-information': 'learning', 'lesson-plans': 'learning',
    'home-visits': 'care', 'student-support': 'care', 'sdq': 'care', 'scholarships': 'care', 'screenings': 'care', 'counseling': 'care',
    'referrals': 'care', 'aar': 'care', 'homeroom-logs': 'care', 'student-concerns': 'care', 'teaching-logs': 'learning',
    'safety-incidents': 'safety', 'safety-risks': 'safety', 'sps-plan': 'safety', 'sos-alerts': 'safety',
    'supervision': 'quality', 'plc': 'quality', 'pa-evaluations': 'quality', 'sar': 'quality', 'quality-assurance': 'quality',
    'swot-issues': 'strategy', 'swot-responses': 'strategy', 'needs-items': 'strategy', 'strategy-items': 'strategy',
    'strategy-plans': 'strategy', 'projects': 'strategy', 'project-reports': 'strategy', 'dev-reports': 'quality', 'report-reviews': 'quality', 'awards': 'quality', 'portfolio': 'quality',
    'staff-checkins': 'system', 'leave-requests': 'system', 'audit-logs': 'system', 'sessions': 'system'
  };
  // ค่าเริ่มต้นที่แนะนำ: ย้ายเฉพาะข้อมูลที่โตเร็ว ส่วนข้อมูลอื่นเก็บไว้ดูย้อนหลังในระบบ
  var DEFAULT_REMOVE = ['attendance-sessions', 'staff-checkins', 'audit-logs', 'sessions', 'sos-alerts'];
  var NOTES = {
    'homerooms': 'ถ้าย้ายออก ห้องเรียน นักเรียนรายห้อง ตารางสอน ปพ.5 และการมาเรียนของปีนี้จะถูกย้ายออกด้วย',
    'student-enrollments': 'ถ้าย้ายออก รายชื่อนักเรียนรายห้องของปีนี้จะดูได้จากไฟล์เก็บถาวรเท่านั้น',
    'porpor5': 'รวมคะแนนรายวิชา (ปพ.5) ถ้าย้ายออก ปพ.6 ของปีนี้จะพิมพ์จากระบบไม่ได้',
    'attendance-sessions': 'ระบบเก็บสรุปการมาเรียนรายคนไว้ให้ (ใช้ใน ปพ.6 และรายงานเวลาเรียน 80%)',
    'pa-evaluations': 'รวมคะแนนของกรรมการและผู้รับการประเมิน',
    'staff-checkins': 'ตั้งแต่เริ่มใช้จนถึงวันสิ้นภาคเรียนสุดท้ายของปีนี้',
    'audit-logs': 'ตั้งแต่เริ่มใช้จนถึงวันสิ้นภาคเรียนสุดท้ายของปีนี้',
    'sos-alerts': 'ตั้งแต่เริ่มใช้จนถึงวันสิ้นภาคเรียนสุดท้ายของปีนี้',
    'student-concerns': 'เรื่องที่นักเรียนแจ้งผ่านห้องรับฟัง (ข้อมูลอ่อนไหว) ถ้าย้ายออก เรื่องที่ยังไม่ปิดจะหายจากกล่องรับเรื่องด้วย ควรปิดเรื่องให้ครบก่อน และนักเรียนจะติดตามด้วยรหัสเดิมไม่ได้อีก',
    'sessions': 'เซสชันที่หมดอายุหรือออกจากระบบแล้ว ลบได้เลย (ไม่ต้องเก็บ)'
  };
  // ย้ายเรื่องนี้ออก = ต้องย้ายเรื่องที่อ้างถึงออกด้วย (กันข้อมูลค้างที่ไม่มีห้องเรียนอ้างอิง)
  var REQUIRES = { 'homerooms': ['student-enrollments', 'timetable', 'porpor5', 'attendance-sessions'], 'projects': ['project-reports'],
    'strategy-items': ['projects', 'project-reports'] };

  // รายการเรื่องทั้งหมด: เรื่องตามปีการศึกษา (ทุกโมดูลที่ผูกกับภาคเรียน) + ข้อมูลที่ผูกกับวันที่
  function specs() {
    var list = [];
    Object.keys(APP_CONFIG.ENTITIES).forEach(function (key) {
      var entity = APP_CONFIG.ENTITIES[key];
      if (!entity.yearScoped) return;
      list.push({ key: key, label: entity.label, sheet: entity.sheet, scope: 'term' });
    });
    list.push({ key: 'attendance-sessions', label: 'การมาเรียนรายคาบ', sheet: 'AttendanceSessions', scope: 'term' });
    list.push({ key: 'report-reviews', label: 'รายงานที่ส่งผู้บริหาร (สถานะ/ความเห็น)', sheet: 'ReportReviews', scope: 'term' });
    list.push({ key: 'swot-responses', label: 'คำตอบแบบสอบถาม SWOT และ Needs', sheet: 'SwotResponses', scope: 'term' });
    list.push({ key: 'strategy-items', label: 'TOWS วิสัยทัศน์ พันธกิจ เป้าประสงค์ กลยุทธ์', sheet: 'StrategyItems', scope: 'term' });
    list.push({ key: 'strategy-plans', label: 'การตั้งค่าแบบสอบถามและการยืนยันแผน', sheet: 'StrategyPlans', scope: 'term' });
    list.push({ key: 'staff-checkins', label: 'การลงเวลามาทำงาน', sheet: 'StaffCheckins', scope: 'date', field: 'checkDate' });
    list.push({ key: 'sos-alerts', label: 'การแจ้งเหตุ SOS', sheet: 'SosAlerts', scope: 'date', field: 'createdAt' });
    list.push({ key: 'audit-logs', label: 'ประวัติการใช้งาน', sheet: 'AuditLogs', scope: 'date', field: 'createdAt' });
    list.push({ key: 'sessions', label: 'เซสชันเข้าสู่ระบบที่หมดอายุ', sheet: 'Sessions', scope: 'expired', noArchive: true });
    var order = GROUPS.map(function (group) { return group[0]; });
    return list.map(function (spec) {
      return Object.assign(spec, { group: GROUP_OF[spec.key] || 'quality', note: NOTES[spec.key] || '', requires: REQUIRES[spec.key] || [],
        def: DEFAULT_REMOVE.indexOf(spec.key) !== -1 ? 'remove' : 'keep' });
    }).sort(function (a, b) { return order.indexOf(a.group) - order.indexOf(b.group); });
  }

  // ตัวกรองแถวของแต่ละเรื่อง (ใช้ทั้งนับ เก็บถาวร และย้ายออก)
  function matcher(spec, termIds, cutoff, nowIso) {
    if (spec.scope === 'term') return function (row) { return termIds[String(row.academicYearId)] === true; };
    if (spec.scope === 'expired') return function (row) { return !!row.revokedAt || String(row.expiresAt) < nowIso; };
    return function (row) { return !!cutoff && String(row[spec.field] || '').slice(0, 10) !== '' && String(row[spec.field]).slice(0, 10) <= cutoff; };
  }

  // นับจำนวนแถว (อ่านเฉพาะคอลัมน์ที่ใช้กรองสำหรับตารางใหญ่ที่ไม่อยู่ในแคช)
  function countRows(spec, match) {
    var light = { AttendanceSessions: ['academicYearId'], AuditLogs: ['createdAt'], Sessions: ['expiresAt', 'revokedAt'], SosAlerts: ['createdAt'] };
    var rows = light[spec.sheet] ? SheetRepository.readColumns(spec.sheet, light[spec.sheet]) : SheetRepository.all(spec.sheet);
    return rows.filter(match).length;
  }

  // ข้อมูลลูกที่ย้ายตามเรื่องหลัก: คะแนน ปพ.5 ตามรายวิชา และคะแนน ว.23 ตามการประเมิน
  var CHILDREN = {
    'porpor5': { sheet: 'GradeSheets', title: 'คะแนน ปพ.5', link: 'courseId' },
    'pa-evaluations': { sheet: 'PaScores', title: 'คะแนนประเมิน ว.23', link: 'evaluationId' },
    'supervision': { sheet: 'SupervisionScores', title: 'คะแนนนิเทศรายกรรมการ', link: 'supervisionId' }
  };

  function actionsFrom(input, list) {
    var actions = {};
    list.forEach(function (spec) {
      var value = input && input[spec.key];
      actions[spec.key] = value === 'remove' || value === 'keep' ? value : spec.def;
    });
    list.forEach(function (spec) {
      if (actions[spec.key] === 'remove') spec.requires.forEach(function (key) { if (actions[key]) actions[key] = 'remove'; });
    });
    return actions;
  }

  function preview(token, data) {
    AuthService.requirePermission(token, PERMISSION);
    data = data || {};
    var year = String(data.year || '').trim();
    if (!/^\d{4}$/.test(year)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกปีการศึกษา');
    var terms = termsOf(year);
    if (!terms.length) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบปีการศึกษา ' + year);
    var termIds = idSet(terms);
    var cutoff = cutoffOf(terms);
    var sourceTerm = terms[terms.length - 1];
    var sourceRooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(sourceTerm.id); });
    var finalGrade = data.finalGrade && APP_CONFIG.GRADE_LEVELS.indexOf(data.finalGrade) !== -1 ? data.finalGrade : highestLevel(sourceRooms);
    var targetYear = String(Number(year) + 1);
    var nowIso = Core.nowIso();
    var categories = specs().map(function (spec) {
      return { key: spec.key, label: spec.label, group: spec.group, note: spec.note, requires: spec.requires, def: spec.def,
        archive: !spec.noArchive, count: countRows(spec, matcher(spec, termIds, cutoff, nowIso)) };
    });
    var counts = categories.reduce(function (result, item) { result[item.key] = item.count; return result; }, {});
    return {
      year: year,
      terms: terms.map(function (term) { return { id: term.id, label: term.year + '/' + term.term, startsAt: term.startsAt, endsAt: term.endsAt, isActive: term.isActive === true }; }),
      cutoff: cutoff,
      closed: SheetRepository.all('YearClosures').some(function (row) { return String(row.year) === year; }),
      categories: categories,
      groups: GROUPS.map(function (group) { return { key: group[0], name: group[1], icon: group[2] }; }),
      counts: { attendance: counts['attendance-sessions'] || 0, audit: counts['audit-logs'] || 0, sessions: counts.sessions || 0 },
      targetYear: targetYear,
      targetExists: termsOf(targetYear).length > 0,
      incomplete: incompleteOf(year, targetYear),
      sourceTerm: sourceTerm.year + '/' + sourceTerm.term,
      finalGrade: finalGrade,
      gradeLevels: APP_CONFIG.GRADE_LEVELS,
      promotion: promotionPlan(sourceTerm, finalGrade)
    };
  }

  // ---------- ปิดปีค้าง: สร้างปีใหม่แล้วแต่ไม่มีประวัติการปิดปี (เช่น หมดเวลาระหว่างทำ) ----------
  // ยกเลิกได้เฉพาะเมื่อปีใหม่มีแค่ห้องเรียนและรายชื่อนักเรียนที่ระบบสร้างให้ (ยังไม่มีใครบันทึกข้อมูลอื่นในปีใหม่)
  var GENERATED = ['Homerooms', 'StudentEnrollments'];

  function incompleteOf(year, targetYear) {
    if (SheetRepository.all('YearClosures').some(function (row) { return String(row.year) === String(year); })) return null;
    var targets = termsOf(targetYear);
    if (!targets.length) return null;
    var targetIds = idSet(targets);
    var inTarget = function (row) { return targetIds[String(row.academicYearId)] === true; };
    var others = specs().filter(function (spec) { return spec.scope === 'term' && GENERATED.indexOf(spec.sheet) === -1; })
      .filter(function (spec) { return SheetRepository.all(spec.sheet).some(inTarget); })
      .map(function (spec) { return spec.label; });
    return { targetYear: targetYear, terms: targets.map(function (term) { return term.year + '/' + term.term; }),
      homerooms: SheetRepository.all('Homerooms').filter(inTarget).length,
      enrollments: SheetRepository.all('StudentEnrollments').filter(inTarget).length,
      otherData: others, canUndo: others.length === 0 };
  }

  function undoIncomplete(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    data = data || {};
    var year = String(data.year || '').trim();
    var terms = termsOf(year);
    if (!terms.length) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบปีการศึกษา ' + year);
    var targetYear = String(Number(year) + 1);
    var info = incompleteOf(year, targetYear);
    if (!info) throw SheetRepository.serviceError('CONFLICT', 'ไม่พบการปิดปีที่ค้างอยู่');
    if (!info.canUndo) throw SheetRepository.serviceError('CONFLICT', 'ปี ' + targetYear + ' มีข้อมูลอื่นบันทึกไว้แล้ว (' + info.otherData.join(', ') + ') จึงยกเลิกอัตโนมัติไม่ได้');
    if (String(data.confirmText || '').trim() !== 'ยกเลิกปี ' + targetYear) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความยืนยันให้ถูกต้อง', { undoConfirm: 'พิมพ์: ยกเลิกปี ' + targetYear });
    }
    var sourceTerm = terms[terms.length - 1];
    var sourceRooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(sourceTerm.id); });
    var finalGrade = highestLevel(sourceRooms);
    var targetIds = idSet(termsOf(targetYear));
    var inTarget = function (row) { return targetIds[String(row.academicYearId)] === true; };
    // นักเรียนชั้นสุดท้ายที่ถูกตั้งเป็น "จบการศึกษา" ระหว่างการปิดปีที่ค้าง: กลับเป็น "กำลังศึกษา"
    var finalRooms = idSet(sourceRooms.filter(function (room) { return room.gradeLevel === finalGrade || !nextLevel(room.gradeLevel); }));
    var finalStudents = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      if (String(row.academicYearId) === String(sourceTerm.id) && finalRooms[String(row.homeroomId)] && isActiveEnrollment(row)) finalStudents[String(row.studentId)] = true;
    });
    var revert = {};
    SheetRepository.all('Students').forEach(function (student) {
      if (finalStudents[String(student.id)] && student.status === 'จบการศึกษา') revert[String(student.id)] = { status: 'กำลังศึกษา' };
    });
    var result = {
      enrollments: removeRows('StudentEnrollments', inTarget),
      homerooms: removeRows('Homerooms', inTarget),
      students: updateRows('Students', revert, context.user.id)
    };
    removeRows('AcademicYears', function (row) { return targetIds[String(row.id)] === true; });
    setActiveTerm(sourceTerm.id, context.user.id);
    AuditService.write('YEAR_CLOSE_UNDONE', 'AcademicYears', targetYear, result, context.user.id);
    SheetRepository.clearAllCaches();
    return Object.assign({ targetYear: targetYear, activeTerm: sourceTerm.year + '/' + sourceTerm.term }, result);
  }

  function history(token) {
    AuthService.requirePermission(token, PERMISSION);
    return { items: SheetRepository.all('YearClosures').sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); })
      .map(function (row) {
        var summary = {};
        try { summary = JSON.parse(row.summaryJson || '{}'); } catch (error) { summary = {}; }
        return { year: row.year, archiveUrl: row.archiveUrl, closedAt: row.createdAt, summary: summary };
      }) };
  }

  // ---------- ปิดปีการศึกษา ----------
  // ลำดับ: 1) สำเนาทุกเรื่องลงไฟล์เก็บถาวร 2) เลื่อนชั้น 3) เก็บสรุปการมาเรียนรายคน 4) ย้ายเรื่องที่เลือกออกจากระบบหลัก
  function run(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    data = data || {};
    var plan = preview(token, data);
    if (String(data.confirmText || '').trim() !== 'ปิดปีการศึกษา ' + plan.year) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความยืนยันให้ถูกต้อง', { confirmText: 'พิมพ์: ปิดปีการศึกษา ' + plan.year });
    }
    if (plan.closed) throw SheetRepository.serviceError('CONFLICT', 'ปีการศึกษา ' + plan.year + ' ปิดไปแล้ว');
    var list = specs();
    // รองรับตัวเลือกแบบเดิม (purgeAttendance / purgeAudit / purgeSessions)
    var input = Object.assign({}, data.actions || {});
    [['purgeAttendance', 'attendance-sessions'], ['purgeAudit', 'audit-logs'], ['purgeSessions', 'sessions']].forEach(function (pair) {
      if (data[pair[0]] === false && !input[pair[1]]) input[pair[1]] = 'keep';
    });
    var actions = actionsFrom(input, list);
    var options = { promote: data.promote !== false, copyAdvisors: data.copyAdvisors !== false, setActive: data.setActive !== false };
    var terms = termsOf(plan.year);
    var termIds = idSet(terms);
    var nowIso = Core.nowIso();
    var summary = { attendanceArchived: 0, attendanceSummaries: 0, auditArchived: 0, sessionsRemoved: 0, promoted: 0, graduated: 0,
      newHomerooms: 0, targetYear: '', removed: {}, kept: [] };

    // ถ้าหยุดกลางทาง ระบบบอกว่าถึงขั้นไหน; ทุกขั้นทำซ้ำได้ปลอดภัย (ข้ามสิ่งที่ทำไปแล้ว) จึงกดปิดปีซ้ำเพื่อทำต่อได้
    var step = 'สร้างไฟล์เก็บถาวร';
    try {
    // 1) เก็บถาวรทุกเรื่องของปีนี้ก่อนเสมอ
    var archive = createArchive(plan, terms, termIds, list, actions);
    step = 'เลื่อนชั้นและสร้างปีการศึกษาใหม่';

    // 2) เลื่อนชั้น (ต้องทำก่อนย้ายห้องเรียน/รายชื่อนักเรียนของปีนี้ออก)
    if (options.promote) Object.assign(summary, promote(plan, terms[terms.length - 1], options, context.user.id));

    step = 'เก็บสรุปการมาเรียน';
    // 3) ย้ายการมาเรียนรายคาบออก: เก็บสรุปรายคนไว้ในระบบ (ใช้ใน ปพ.6 และรายงานเวลาเรียน)
    if (actions['attendance-sessions'] === 'remove') {
      var totals = attendanceTotals(SheetRepository.all('AttendanceSessions').filter(function (row) { return termIds[String(row.academicYearId)]; }));
      var existingSummaries = SheetRepository.all('AttendanceSummaries').filter(function (row) { return termIds[String(row.academicYearId)]; });
      var summaryRows = totals.filter(function (item) {
        return !existingSummaries.some(function (row) { return row.academicYearId === item.academicYearId && row.studentId === item.studentId; });
      }).map(function (item) {
        return { academicYearId: item.academicYearId, studentId: item.studentId, homeroomId: item.homeroomId,
          present: item.P, late: item.L, leave: item.E, absent: item.A };
      });
      SheetRepository.insertMany('AttendanceSummaries', summaryRows, context.user.id);
      summary.attendanceSummaries = summaryRows.length;
    }

    step = 'ย้ายข้อมูลที่เลือกออกจากระบบหลัก';
    // 4) ย้ายเรื่องที่เลือกออก (ข้อมูลลูกย้ายตามเรื่องหลัก)
    list.forEach(function (spec) {
      if (actions[spec.key] !== 'remove') { summary.kept.push(spec.key); return; }
      var match = matcher(spec, termIds, plan.cutoff, nowIso);
      var child = CHILDREN[spec.key];
      if (child) {
        var parents = idSet(SheetRepository.all(spec.sheet).filter(match));
        removeRows(child.sheet, function (row) { return parents[String(row[child.link])] === true; });
      }
      var removed = removeRows(spec.sheet, match);
      if (removed) summary.removed[spec.key] = removed;
    });
    summary.attendanceArchived = summary.removed['attendance-sessions'] || 0;
    summary.auditArchived = summary.removed['audit-logs'] || 0;
    summary.sessionsRemoved = summary.removed.sessions || 0;
    step = 'บันทึกประวัติการปิดปี';
    } catch (error) {
      var message = String(error && error.message ? error.message : error);
      var stopped = SheetRepository.serviceError('YEAR_CLOSE_INCOMPLETE', 'การปิดปีหยุดที่ขั้น “' + step + '” (' + message + ') ข้อมูลที่ทำไปแล้วไม่เสียหาย กดปิดปีการศึกษาอีกครั้งเพื่อทำต่อจากเดิมได้');
      SheetRepository.clearAllCaches();
      throw stopped;
    }

    SheetRepository.insert('YearClosures', { year: plan.year, archiveFileId: archive.getId(), archiveUrl: archive.getUrl(),
      summaryJson: JSON.stringify(summary) }, context.user.id);
    AuditService.write('YEAR_CLOSED', 'AcademicYears', plan.year, { removed: summary.removed, targetYear: summary.targetYear }, context.user.id);
    SheetRepository.clearAllCaches();
    return { year: plan.year, archiveUrl: archive.getUrl(), summary: summary };
  }

  // ส่งออกข้อมูลทั้งปีเป็นไฟล์ Google Sheet โดยไม่ปิดปีและไม่ลบข้อมูลใด
  function exportYear(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    var plan = preview(token, data);
    var terms = termsOf(plan.year);
    var archive = createArchive(plan, terms, idSet(terms), specs(), null);
    AuditService.write('YEAR_EXPORTED', 'AcademicYears', plan.year, {}, context.user.id);
    return { year: plan.year, url: archive.getUrl() };
  }

  function createArchive(plan, terms, termIds, list, actions) {
    var school = SettingsService.getPublicSettings().schoolName || 'โรงเรียน';
    var title = (actions ? 'เก็บถาวร' : 'สำเนาข้อมูล') + ' ปีการศึกษา ' + plan.year + ' - ' + school;
    var archive = SpreadsheetApp.create(title);
    try { DriveApp.getFileById(archive.getId()).moveTo(FolderService.getFolder('archives')); } catch (error) { /* ถ้าย้ายไม่ได้ ไฟล์อยู่ที่ My Drive */ }
    var info = archive.insertSheet('ข้อมูลการปิดปี');
    var nowIso = Core.nowIso();
    var lines = [
      ['ปีการศึกษา', "'" + plan.year],
      ['ภาคเรียน', terms.map(function (term) { return term.year + '/' + term.term; }).join(', ')],
      [actions ? 'วันที่ปิดปี' : 'วันที่ส่งออก', nowIso],
      ['ข้อมูลที่ผูกกับวันที่ ถึงวันที่', plan.cutoff || '-'],
      ['หมายเหตุ', 'ไฟล์นี้เป็นสำเนาข้อมูลของปีการศึกษา ห้ามแก้ไขหัวตาราง'],
      ['', ''],
      ['เรื่อง', actions ? 'สิ่งที่ทำในระบบหลัก' : 'จำนวนแถว']
    ];
    list.forEach(function (spec) {
      if (spec.noArchive) return;
      var match = matcher(spec, termIds, plan.cutoff, nowIso);
      var rows = SheetRepository.all(spec.sheet).filter(match);
      if (rows.length) writeTable(archive, spec.label, spec.sheet, rows);
      var child = CHILDREN[spec.key];
      if (child && rows.length) {
        var parents = idSet(rows);
        var children = SheetRepository.all(child.sheet).filter(function (row) { return parents[String(row[child.link])] === true; });
        if (children.length) writeTable(archive, child.title, child.sheet, children);
      }
      if (spec.key === 'attendance-sessions' && rows.length) writeAttendanceSheet(archive, attendanceTotals(rows));
      lines.push([spec.label + ' (' + rows.length + ' แถว)', actions ? (actions[spec.key] === 'remove' ? 'ย้ายออกจากระบบหลัก' : 'เก็บไว้ในระบบ') : rows.length]);
    });
    info.getRange(1, 1, lines.length, 2).setValues(lines);
    removeDefaultSheet(archive);
    return archive;
  }

  function writeTable(archive, title, sheetName, rows) {
    var headers = APP_CONFIG.SHEETS[sheetName];
    var sheet = archive.insertSheet(uniqueTitle(archive, title));
    var values = [headers].concat(rows.map(function (row) { return SheetRepository.objectToRow(headers, row); }));
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
    sheet.setFrozenRows(1);
  }

  function uniqueTitle(archive, title) {
    var name = String(title).slice(0, 90);
    var index = 2;
    while (archive.getSheetByName(name)) { name = String(title).slice(0, 86) + ' (' + index + ')'; index += 1; }
    return name;
  }

  function removeDefaultSheet(archive) {
    var sheets = archive.getSheets();
    if (sheets.length > 1) { try { archive.deleteSheet(sheets[0]); } catch (error) { /* ไม่เป็นไร */ } }
  }

  function attendanceTotals(rows) {
    var byKey = {};
    rows.forEach(function (session) {
      var records = {};
      try { records = JSON.parse(session.recordsJson || '{}'); } catch (error) { records = {}; }
      Object.keys(records).forEach(function (studentId) {
        var key = session.academicYearId + '|' + studentId;
        var item = byKey[key] || (byKey[key] = { academicYearId: String(session.academicYearId), studentId: studentId,
          homeroomId: String(session.homeroomId), P: 0, L: 0, E: 0, A: 0 });
        var status = records[studentId] && records[studentId].s;
        if (item[status] !== undefined) item[status] += 1;
      });
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; });
  }

  function writeAttendanceSheet(archive, totals) {
    if (!totals.length) return;
    var students = EntityService.indexBy(SheetRepository.all('Students', { includeDeleted: true }));
    var rooms = EntityService.indexBy(SheetRepository.all('Homerooms', { includeDeleted: true }));
    var terms = EntityService.indexBy(SheetRepository.all('AcademicYears', { includeDeleted: true }));
    var values = [['ภาคเรียน', 'ห้อง', 'เลขประจำตัว', 'ชื่อ-นามสกุล', 'มา', 'สาย', 'ลา', 'ขาด']].concat(totals.map(function (item) {
      var student = students[item.studentId] || {};
      var room = rooms[item.homeroomId] || {};
      var term = terms[item.academicYearId] || {};
      return [term.year ? term.year + '/' + term.term : '', room.gradeLevel ? room.gradeLevel + '/' + room.roomName : '',
        "'" + (student.studentCode || ''), ((student.firstName || '') + ' ' + (student.lastName || '')).trim(), item.P, item.L, item.E, item.A];
    }));
    var sheet = archive.insertSheet('สรุปการมาเรียนรายคน');
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.setFrozenRows(1);
  }

  // เขียนตารางใหม่โดยตัดแถวที่ตรงเงื่อนไขออก (ข้อมูลถูกเก็บถาวรไว้แล้ว)
  function removeRows(sheetName, predicate) {
    var rows = SheetRepository.all(sheetName, { includeDeleted: true });
    var expected = rows.reduce(function (versions, row) { versions[row.id] = row.version; return versions; }, { __count: rows.length });
    var kept = rows.filter(function (row) { return !predicate(row); });
    if (kept.length === rows.length) return 0;
    var replacement = {};
    replacement[sheetName] = kept;
    var versions = {};
    versions[sheetName] = expected;
    SheetRepository.replaceTablesAtomically(replacement, versions);
    return rows.length - kept.length;
  }

  function ensureTerm(year, term, actorId) {
    var existing = SheetRepository.all('AcademicYears').filter(function (row) { return String(row.year) === String(year) && String(row.term) === String(term); })[0];
    if (existing) return { term: existing, created: false };
    var gregorian = Number(year) - 543;
    return { created: true, term: SheetRepository.insert('AcademicYears', { year: String(year), term: String(term),
      startsAt: gregorian + (String(term) === '1' ? '-05-16' : '-11-01'), endsAt: (String(term) === '1' ? gregorian + '-10-10' : (gregorian + 1) + '-03-31'),
      isActive: false }, actorId) };
  }

  // แก้หลายแถวในครั้งเดียว (เขียนตารางรอบเดียว) เร็วกว่าแก้ทีละแถวหลายสิบเท่า และไม่เสี่ยงเกินเวลา 6 นาทีของ Apps Script
  function updateRows(sheetName, changesById, actorId) {
    var rows = SheetRepository.all(sheetName, { includeDeleted: true });
    var expected = rows.reduce(function (versions, row) { versions[row.id] = row.version; return versions; }, { __count: rows.length });
    var now = Core.nowIso();
    var count = 0;
    rows.forEach(function (row) {
      var change = changesById[String(row.id)];
      if (!change) return;
      Object.assign(row, change, { updatedAt: now, updatedBy: actorId, version: Number(row.version) + 1 });
      count += 1;
    });
    if (!count) return 0;
    var replacement = {};
    replacement[sheetName] = rows;
    var versions = {};
    versions[sheetName] = expected;
    SheetRepository.replaceTablesAtomically(replacement, versions);
    return count;
  }

  function setActiveTerm(termId, actorId) {
    var changes = {};
    SheetRepository.all('AcademicYears').forEach(function (row) {
      var shouldBe = String(row.id) === String(termId);
      if ((row.isActive === true) !== shouldBe) changes[String(row.id)] = { isActive: shouldBe };
    });
    updateRows('AcademicYears', changes, actorId);
  }

  // คัดลอกห้องเรียนและนักเรียนจากภาคเรียนต้นทางไปภาคเรียนปลายทาง (mapLevel คืนระดับชั้นใหม่ หรือ '' = จบการศึกษา)
  function copyRoster(sourceTerm, targetTerm, mapLevel, copyAdvisors, actorId) {
    var sourceRooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(sourceTerm.id); });
    var targetRooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(targetTerm.id); });
    var roomMap = {};
    var newRooms = [];
    var newRoomSources = [];
    sourceRooms.forEach(function (room) {
      var level = mapLevel(room.gradeLevel);
      if (!level) return;
      var target = targetRooms.filter(function (row) { return row.gradeLevel === level && String(row.roomName) === String(room.roomName); })[0];
      if (target) { roomMap[room.id] = target; return; }
      newRooms.push({ academicYearId: targetTerm.id, gradeLevel: level, roomName: room.roomName,
        advisorId: copyAdvisors ? room.advisorId || '' : '', coAdvisorId: copyAdvisors ? room.coAdvisorId || '' : '' });
      newRoomSources.push(room);
    });
    // สร้างห้องใหม่ทั้งหมดในครั้งเดียว
    var created = newRooms.length;
    SheetRepository.insertMany('Homerooms', newRooms, actorId).forEach(function (record, index) { roomMap[newRoomSources[index].id] = record; });
    var enrolled = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      if (String(row.academicYearId) === String(targetTerm.id)) enrolled[row.studentId] = true;
    });
    var rooms = EntityService.indexBy(sourceRooms);
    var moved = 0;
    var graduates = [];
    var inserts = [];
    SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.academicYearId) === String(sourceTerm.id) && isActiveEnrollment(row);
    }).forEach(function (row) {
      var room = rooms[row.homeroomId];
      if (!room) return;
      if (!mapLevel(room.gradeLevel)) { graduates.push(row.studentId); return; }
      if (enrolled[row.studentId] || !roomMap[room.id]) return;
      inserts.push({ academicYearId: targetTerm.id, homeroomId: roomMap[room.id].id, number: row.number, studentId: row.studentId, status: 'กำลังศึกษา' });
      moved += 1;
    });
    SheetRepository.insertMany('StudentEnrollments', inserts, actorId);
    return { newHomerooms: created, moved: moved, graduates: graduates };
  }

  function promote(plan, sourceTerm, options, actorId) {
    var target = ensureTerm(plan.targetYear, '1', actorId).term;
    var result = copyRoster(sourceTerm, target, function (level) {
      return level === plan.finalGrade ? '' : nextLevel(level);
    }, options.copyAdvisors, actorId);
    var graduateIds = idSet(result.graduates.map(function (id) { return { id: id }; }));
    var graduated = {};
    SheetRepository.all('Students').forEach(function (student) {
      if (graduateIds[String(student.id)] && student.status !== 'จบการศึกษา') graduated[String(student.id)] = { status: 'จบการศึกษา' };
    });
    updateRows('Students', graduated, actorId);
    if (options.setActive) setActiveTerm(target.id, actorId);
    return { promoted: result.moved, graduated: result.graduates.length, newHomerooms: result.newHomerooms,
      targetYear: target.year + '/' + target.term };
  }

  // ---------- ขึ้นภาคเรียนใหม่ (ชั้นเดิม) ----------
  function copyTerm(token, data) {
    var context = AuthService.requirePermission(token, PERMISSION);
    data = data || {};
    var source = SheetRepository.findById('AcademicYears', data.sourceTermId);
    var target = SheetRepository.findById('AcademicYears', data.targetTermId);
    if (!source || !target) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกภาคเรียนต้นทางและปลายทาง');
    if (String(source.id) === String(target.id)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ภาคเรียนต้นทางและปลายทางต้องไม่ซ้ำกัน');
    if (data.dryRun) {
      var rooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === String(source.id); });
      var students = SheetRepository.all('StudentEnrollments').filter(function (row) {
        return String(row.academicYearId) === String(source.id) && isActiveEnrollment(row);
      });
      var already = SheetRepository.all('StudentEnrollments').filter(function (row) { return String(row.academicYearId) === String(target.id); });
      return { dryRun: true, homerooms: rooms.length, students: students.length, alreadyInTarget: already.length };
    }
    var result = copyRoster(source, target, function (level) { return level; }, data.copyAdvisors !== false, context.user.id);
    if (data.setActive) setActiveTerm(target.id, context.user.id);
    AuditService.write('TERM_COPIED', 'AcademicYears', target.id, { from: source.id, moved: result.moved }, context.user.id);
    return { newHomerooms: result.newHomerooms, moved: result.moved };
  }

  return { preview: preview, run: run, history: history, copyTerm: copyTerm, exportYear: exportYear, undoIncomplete: undoIncomplete };
})();
