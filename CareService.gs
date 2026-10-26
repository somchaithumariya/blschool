// ระบบดูแลช่วยเหลือนักเรียน: แฟ้มรายคน (แบบ 5.1–5.6), สรุปรายห้อง, แบบประเมิน SDQ 25 ข้อ, แผนที่บ้านนักเรียน และ AI สรุปรายคน
var CareService = (function () {
  'use strict';

  // ข้อ SDQ ฉบับครู 25 ข้อ (ลำดับตามแบบประเมินมาตรฐาน) และการให้คะแนน
  var SDQ_ITEMS = ['ห่วงใยความรู้สึกคนอื่น', 'อยู่ไม่นิ่ง นั่งนานไม่ได้', 'มักบ่นว่าปวดศีรษะ ปวดท้อง หรือไม่สบายบ่อย ๆ', 'เต็มใจแบ่งปันสิ่งของให้ผู้อื่น',
    'มักอาละวาดหรือโมโหร้าย', 'ค่อนข้างแยกตัว ชอบเล่นคนเดียว', 'เชื่อฟัง ทำตามที่ผู้ใหญ่ต้องการ', 'ดูกังวลใจหลายเรื่อง', 'เป็นที่พึ่งได้เวลาที่คนอื่นเสียใจหรือไม่สบายใจ',
    'อยู่ไม่สุข วุ่นวายอย่างมาก', 'มีเพื่อนสนิทอย่างน้อย 1 คน', 'มักมีเรื่องทะเลาะวิวาท หรือรังแกเด็กอื่น', 'ดูไม่มีความสุข ท้อแท้ ร้องไห้บ่อย',
    'เป็นที่ชื่นชอบของเพื่อน', 'วอกแวกง่าย สมาธิสั้น', 'เครียด ไม่ยอมห่างเวลาอยู่ในสถานการณ์ที่ไม่คุ้น', 'ใจดีกับเด็กที่อายุน้อยกว่า',
    'ชอบโกหกหรือขี้โกง', 'ถูกเด็กอื่นล้อเลียนหรือรังแก', 'ชอบอาสาช่วยเหลือผู้อื่น', 'คิดก่อนทำ', 'ขโมยของ', 'เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน',
    'ขี้กลัว ตกใจง่าย', 'ทำงานได้จนเสร็จ มีความตั้งใจในการทำงาน'];
  var SDQ_REVERSED = [7, 11, 14, 21, 25];
  var SDQ_SCALES = { emotional: [3, 8, 13, 16, 24], conduct: [5, 7, 12, 18, 22], hyperactivity: [2, 10, 15, 21, 25], peer: [6, 11, 14, 19, 23],
    prosocial: [1, 4, 9, 17, 20] };
  var SDQ_ASSESSORS = ['ครู', 'ผู้ปกครอง', 'นักเรียน'];

  // ตารางแบบฟอร์มแต่ละแบบในแฟ้มรายคน [ชื่อเมนู, ตาราง, ผูกกับปีการศึกษา]
  var FORMS = [['student-family', 'StudentFamilies', false], ['home-visits', 'HomeVisits', true], ['screenings', 'Screenings', true],
    ['sdq', 'SdqAssessments', true], ['counseling', 'Counselings', true], ['referrals', 'Referrals', true], ['aar', 'AarRecords', true],
    ['student-support', 'SupportCases', true]];

  function activeYearId() {
    var year = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    return year ? String(year.id) : '';
  }

  function studentName(student, titles) {
    var title = titles[student.titleId] ? titles[student.titleId].name : '';
    return (title + (student.firstName || '') + ' ' + (student.lastName || '')).trim();
  }

  // ภาพรวมรายห้อง: สถานะการทำแบบฟอร์มของนักเรียนแต่ละคน
  function overview(token, data) {
    AuthService.requirePermission(token, 'care.view');
    var payload = data || {};
    var yearId = String(payload.academicYearId || activeYearId());
    var homeroomId = String(payload.homeroomId || '');
    if (!homeroomId) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกห้องเรียน', { homeroomId: 'กรุณาเลือกห้องเรียน' });
    var students = AttendanceService.roster(yearId, homeroomId);
    var ids = {};
    students.forEach(function (student) { ids[student.studentId] = true; });
    function latest(sheet, key, dateKey) {
      var map = {};
      SheetRepository.all(sheet).forEach(function (row) {
        if (!ids[row.studentId] || (row.academicYearId !== undefined && String(row.academicYearId) !== yearId && sheet !== 'StudentFamilies')) return;
        if (!map[row.studentId] || String(row[dateKey] || '') >= String(map[row.studentId][dateKey] || '')) map[row.studentId] = row;
      });
      return map;
    }
    function count(sheet) {
      var map = {};
      SheetRepository.all(sheet).forEach(function (row) {
        if (ids[row.studentId] && String(row.academicYearId) === yearId) map[row.studentId] = (map[row.studentId] || 0) + 1;
      });
      return map;
    }
    var family = latest('StudentFamilies', 'studentId', 'updatedAt');
    var visits = latest('HomeVisits', 'studentId', 'visitDate');
    var screens = latest('Screenings', 'studentId', 'screenDate');
    var sdq = latest('SdqAssessments', 'studentId', 'updatedAt');
    var counsel = count('Counselings');
    var refer = count('Referrals');
    return { academicYearId: yearId, rows: students.map(function (student) {
      var id = student.studentId;
      return { studentId: id, number: student.number, code: student.code, name: student.name,
        family: Boolean(family[id]), visitDate: visits[id] ? visits[id].visitDate : '', screening: screens[id] ? screens[id].result : '',
        sdq: sdq[id] ? sdq[id].result : '', counseling: counsel[id] || 0, referrals: refer[id] || 0 };
    }) };
  }

  // แฟ้มรายคน: ข้อมูลพื้นฐาน + ทุกแบบฟอร์มของนักเรียนคนนี้ (ปีที่เลือก)
  function file(token, data) {
    AuthService.requirePermission(token, 'care.view');
    var payload = data || {};
    var student = SheetRepository.findById('Students', payload.studentId);
    if (!student) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบนักเรียน');
    var yearId = String(payload.academicYearId || activeYearId());
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var enrollment = SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.studentId) === String(student.id) && String(row.academicYearId) === yearId;
    })[0] || null;
    var homeroom = enrollment ? SheetRepository.findById('Homerooms', enrollment.homeroomId) : null;
    var info = SheetRepository.all('StudentInformation').filter(function (row) {
      return String(row.studentId) === String(student.id) && String(row.academicYearId) === yearId;
    })[0] || null;
    var forms = {};
    FORMS.forEach(function (form) {
      forms[form[0]] = SheetRepository.all(form[1]).filter(function (row) {
        return String(row.studentId) === String(student.id) && (!form[2] || String(row.academicYearId) === yearId);
      });
    });
    return {
      academicYearId: yearId,
      student: { id: student.id, code: student.studentCode, name: studentName(student, titles), gender: student.gender, birthDate: student.birthDate,
        guardianName: student.guardianName, guardianPhone: student.guardianPhone, address: student.address, status: student.status,
        photoFileId: student.photoFileId || '' },
      homeroom: homeroom ? { id: homeroom.id, name: homeroom.gradeLevel + '/' + homeroom.roomName, advisorId: homeroom.advisorId } : null,
      number: enrollment ? enrollment.number : '',
      info: info,
      forms: forms
    };
  }

  // ---------- SDQ 25 ข้อ ----------
  function sdqItems(token) {
    AuthService.requirePermission(token, 'sdq.view');
    return { items: SDQ_ITEMS, assessors: SDQ_ASSESSORS };
  }

  function scoreSdq(answers) {
    var result = { emotional: 0, conduct: 0, hyperactivity: 0, peer: 0, prosocial: 0 };
    answers.forEach(function (value, index) {
      var number = index + 1;
      var score = SDQ_REVERSED.indexOf(number) !== -1 ? 2 - value : value;
      Object.keys(SDQ_SCALES).forEach(function (scale) { if (SDQ_SCALES[scale].indexOf(number) !== -1) result[scale] += score; });
    });
    return result;
  }

  // บันทึกคำตอบ 25 ข้อ ลงเมนู "แบบประเมิน SDQ" (1 แถวต่อนักเรียน/ผู้ประเมิน/ปี — ประเมินซ้ำจะแทนที่ของเดิม)
  function saveSdq(token, data) {
    var context = AuthService.requirePermission(token, 'sdq.edit');
    var payload = data || {};
    var answers = Array.isArray(payload.answers) ? payload.answers.map(Number) : [];
    if (answers.length !== 25 || answers.some(function (value) { return [0, 1, 2].indexOf(value) === -1; })) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตอบให้ครบทั้ง 25 ข้อ');
    }
    var entity = EntityService.getEntity('sdq');
    var scores = scoreSdq(answers);
    var input = Object.assign({ academicYearId: payload.academicYearId || activeYearId(), studentId: payload.studentId, assessor: payload.assessor }, scores);
    var existing = SheetRepository.all(entity.sheet).filter(function (row) {
      return String(row.academicYearId) === String(input.academicYearId) && String(row.studentId) === String(input.studentId) && row.assessor === input.assessor;
    })[0];
    var prepared = EntityService.prepare(entity, input, existing ? existing.id : '', SheetRepository.all(entity.sheet));
    if (!Core.isEmptyObject(prepared.errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', prepared.errors);
    var record = existing ? SheetRepository.update(entity.sheet, existing.id, prepared.values, existing.version, context.user.id)
      : SheetRepository.insert(entity.sheet, prepared.values, context.user.id);
    AuditService.write(existing ? 'UPDATE' : 'CREATE', entity.sheet, record.id, { form: 'sdq25' }, context.user.id);
    return { id: record.id, scores: scores, totalScore: prepared.values.totalScore, result: prepared.values.result };
  }

  // ---------- แผนที่บ้านนักเรียน ----------
  function homeMap(token, data) {
    AuthService.requirePermission(token, 'homeVisit.view');
    var yearId = String((data && data.academicYearId) || activeYearId());
    var students = EntityService.indexBy(SheetRepository.all('Students'));
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var rooms = EntityService.indexBy(SheetRepository.all('Homerooms'));
    var roomOf = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      if (String(row.academicYearId) === yearId) roomOf[row.studentId] = rooms[row.homeroomId] ? rooms[row.homeroomId].gradeLevel + '/' + rooms[row.homeroomId].roomName : '';
    });
    var latest = {};
    SheetRepository.all('HomeVisits').forEach(function (row) {
      if (String(row.academicYearId) !== yearId || !row.latitude || !row.longitude) return;
      if (!latest[row.studentId] || String(row.visitDate) > String(latest[row.studentId].visitDate)) latest[row.studentId] = row;
    });
    var points = Object.keys(latest).map(function (studentId) {
      var visit = latest[studentId];
      var student = students[studentId] || {};
      return { studentId: studentId, name: studentName(student, titles), room: roomOf[studentId] || '', lat: Number(visit.latitude), lng: Number(visit.longitude),
        visitDate: visit.visitDate, economicStatus: visit.economicStatus || '', familyRelation: visit.familyRelation || '', distanceKm: visit.distanceKm };
    }).filter(function (point) { return isFinite(point.lat) && isFinite(point.lng); });
    return { points: points, school: CheckinService.schoolLocation() };
  }

  // ---------- วิเคราะห์ผู้เรียนรายบุคคลด้วย AI (รายละเอียดอยู่ที่ CareInsightService) ----------
  function aiSummary(token, data) { return CareInsightService.analyzeStudent(token, data); }

  return { overview: overview, file: file, sdqItems: sdqItems, saveSdq: saveSdq, scoreSdq: scoreSdq, homeMap: homeMap, aiSummary: aiSummary,
    SDQ_ITEMS: SDQ_ITEMS };
})();
