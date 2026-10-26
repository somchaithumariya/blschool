/**
 * ปพ.5 บันทึกผลการเรียน รายงาน ปพ.5 และ ปพ.6 รายบุคคล
 * คะแนนของแต่ละรายวิชาเก็บใน GradeSheets 1 แถวต่อ 1 วิชา: { studentId: { c: เก็บ, e: สอบ, x: ผลพิเศษ } }
 */
var GradeService = (function () {
  'use strict';

  var SPECIAL = ['', 'ร', 'มส', 'มผ', 'ผ'];

  // เกณฑ์ระดับผลการเรียน 8 ระดับ
  function gradeOf(total) {
    if (total === null || total === undefined || total === '') return '';
    var steps = [[80, '4'], [75, '3.5'], [70, '3'], [65, '2.5'], [60, '2'], [55, '1.5'], [50, '1']];
    for (var index = 0; index < steps.length; index += 1) if (total >= steps[index][0]) return steps[index][1];
    return '0';
  }

  function computeRow(course, score) {
    var entry = score || {};
    if (course.subjectType === 'กิจกรรม') return { c: '', e: '', total: '', grade: entry.x || '' };
    if (entry.x) return { c: entry.c, e: entry.e, total: '', grade: entry.x };
    var hasScore = entry.c !== '' && entry.c !== undefined && entry.c !== null || entry.e !== '' && entry.e !== undefined && entry.e !== null;
    if (!hasScore) return { c: '', e: '', total: '', grade: '' };
    var total = Math.round(((Number(entry.c) || 0) + (Number(entry.e) || 0)) * 100) / 100;
    return { c: entry.c, e: entry.e, total: total, grade: gradeOf(total) };
  }

  function getCourse(courseId) {
    var course = SheetRepository.findById('Courses', courseId);
    if (!course) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบรายวิชา');
    return course;
  }

  function scoresOf(courseId) {
    var sheet = SheetRepository.findByField('GradeSheets', 'courseId', courseId)[0] || null;
    var scores = {};
    if (sheet) { try { scores = JSON.parse(sheet.scoresJson || '{}'); } catch (error) { scores = {}; } }
    return { sheet: sheet, scores: scores };
  }

  function getSheet(token, data) {
    AuthService.requirePermission(token, 'porpor5.view');
    var course = getCourse(data && data.courseId);
    var stored = scoresOf(course.id);
    var students = AttendanceService.roster(course.academicYearId, course.homeroomId);
    return {
      course: course,
      sheet: stored.sheet ? { id: stored.sheet.id, version: stored.sheet.version, status: stored.sheet.status } : null,
      rows: students.map(function (student) {
        return Object.assign({}, student, computeRow(course, stored.scores[student.studentId]));
      })
    };
  }

  function saveSheet(token, data) {
    var payload = data || {};
    var context = AuthService.requirePermission(token, 'porpor5.grade');
    var course = getCourse(payload.courseId);
    var students = AttendanceService.roster(course.academicYearId, course.homeroomId);
    var input = payload.scores || {};
    var scores = {};
    var errors = [];
    var collectedMax = Number(course.collectedMax) || 0;
    var examMax = Number(course.examMax) || 0;
    students.forEach(function (student) {
      var entry = input[student.studentId] || {};
      var c = entry.c === '' || entry.c === null || entry.c === undefined ? '' : Number(entry.c);
      var e = entry.e === '' || entry.e === null || entry.e === undefined ? '' : Number(entry.e);
      var x = SPECIAL.indexOf(String(entry.x || '')) === -1 ? '' : String(entry.x || '');
      if (c !== '' && (!isFinite(c) || c < 0 || c > collectedMax)) errors.push('เลขที่ ' + student.number + ': คะแนนเก็บต้องอยู่ระหว่าง 0-' + collectedMax);
      if (e !== '' && (!isFinite(e) || e < 0 || e > examMax)) errors.push('เลขที่ ' + student.number + ': คะแนนสอบต้องอยู่ระหว่าง 0-' + examMax);
      scores[student.studentId] = { c: c, e: e, x: x };
    });
    if (errors.length) throw SheetRepository.serviceError('VALIDATION_ERROR', errors.slice(0, 5).join('\n'));
    var stored = scoresOf(course.id);
    var values = { courseId: course.id, scoresJson: JSON.stringify(scores), status: payload.status === 'submitted' ? 'submitted' : 'draft' };
    var saved = stored.sheet
      ? SheetRepository.update('GradeSheets', stored.sheet.id, values, payload.version || stored.sheet.version, context.user.id)
      : SheetRepository.insert('GradeSheets', values, context.user.id);
    AuditService.write('GRADES_SAVE', 'Courses', course.id, { status: values.status }, context.user.id);
    return { id: saved.id, version: saved.version, status: saved.status };
  }

  // รายงาน ปพ.5: การกระจายระดับผลการเรียนของทุกวิชาในห้อง
  function courseReport(token, data) {
    AuthService.requirePermission(token, 'porpor5.view');
    var payload = data || {};
    var courses = SheetRepository.all('Courses').filter(function (course) {
      return String(course.academicYearId) === String(payload.academicYearId) &&
        (!payload.homeroomId || String(course.homeroomId) === String(payload.homeroomId));
    });
    var sheets = {};
    SheetRepository.all('GradeSheets').forEach(function (row) { sheets[row.courseId] = row; });
    var rosters = {};
    return { rows: courses.map(function (course) {
      var students = rosters[course.homeroomId] = rosters[course.homeroomId] || AttendanceService.roster(course.academicYearId, course.homeroomId);
      var scores = {};
      if (sheets[course.id]) { try { scores = JSON.parse(sheets[course.id].scoresJson || '{}'); } catch (error) { scores = {}; } }
      var distribution = {};
      var sum = 0;
      var graded = 0;
      students.forEach(function (student) {
        var result = computeRow(course, scores[student.studentId]);
        var key = result.grade || 'ยังไม่กรอก';
        distribution[key] = (distribution[key] || 0) + 1;
        if (/^[0-9.]+$/.test(result.grade)) { sum += Number(result.grade); graded += 1; }
      });
      return { course: course, students: students.length, distribution: distribution,
        average: graded ? Math.round(sum * 100 / graded) / 100 : null, status: sheets[course.id] ? sheets[course.id].status : '' };
    }).sort(function (a, b) { return String(a.course.subjectCode).localeCompare(String(b.course.subjectCode), 'th'); }) };
  }

  // ปพ.6: ผลการเรียนรายบุคคลทุกวิชา + GPA + สรุปการมาเรียน
  function studentReport(token, data) {
    AuthService.requirePermission(token, 'porpor6.view');
    var payload = data || {};
    var enrollment = SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.studentId) === String(payload.studentId) && String(row.academicYearId) === String(payload.academicYearId);
    })[0];
    if (!enrollment) throw SheetRepository.serviceError('NOT_FOUND', 'นักเรียนไม่มีรายชื่อในปีการศึกษานี้');
    var courses = SheetRepository.all('Courses').filter(function (course) {
      return String(course.academicYearId) === String(payload.academicYearId) && String(course.homeroomId) === String(enrollment.homeroomId);
    }).sort(function (a, b) { return String(a.subjectCode).localeCompare(String(b.subjectCode), 'th'); });
    var sheets = {};
    SheetRepository.all('GradeSheets').forEach(function (row) { sheets[row.courseId] = row; });
    var creditSum = 0;
    var pointSum = 0;
    var rows = courses.map(function (course) {
      var scores = {};
      if (sheets[course.id]) { try { scores = JSON.parse(sheets[course.id].scoresJson || '{}'); } catch (error) { scores = {}; } }
      var result = computeRow(course, scores[payload.studentId]);
      if (course.subjectType !== 'กิจกรรม' && /^[0-9.]+$/.test(result.grade)) {
        creditSum += Number(course.credit) || 0;
        pointSum += (Number(course.credit) || 0) * Number(result.grade);
      }
      return { subjectCode: course.subjectCode, subjectName: course.subjectName, subjectType: course.subjectType,
        credit: course.credit, total: result.total, grade: result.grade };
    });
    var year = SheetRepository.findById('AcademicYears', payload.academicYearId) || {};
    var attendance = { P: 0, L: 0, E: 0, A: 0 };
    // ปีที่ปิดแล้ว: ข้อมูลรายคาบย้ายไปเก็บถาวร ใช้สรุปรายคนที่บันทึกไว้แทน
    var saved = SheetRepository.all('AttendanceSummaries').filter(function (row) {
      return String(row.academicYearId) === String(payload.academicYearId) && String(row.studentId) === String(payload.studentId);
    })[0];
    if (saved) {
      attendance = { P: Number(saved.present) || 0, L: Number(saved.late) || 0, E: Number(saved.leave) || 0, A: Number(saved.absent) || 0 };
    } else if (year.startsAt && year.endsAt) {
      SheetRepository.all('AttendanceSessions').forEach(function (session) {
        if (String(session.homeroomId) !== String(enrollment.homeroomId)) return;
        if (session.attendanceDate < year.startsAt || session.attendanceDate > year.endsAt) return;
        var records = {};
        try { records = JSON.parse(session.recordsJson || '{}'); } catch (error) { records = {}; }
        var record = records[payload.studentId];
        if (record && attendance[record.s] !== undefined) attendance[record.s] += 1;
      });
    }
    return { enrollment: enrollment, rows: rows, gpa: creditSum ? Math.round(pointSum * 100 / creditSum) / 100 : null,
      credits: creditSum, attendance: attendance };
  }

  // สรุปผลการเรียนรายคนของทั้งปี (ห้องเดียวหรือทุกห้อง): เกรดเฉลี่ยถ่วงหน่วยกิต และวิชาที่ได้ 0 / ร / มส / มผ
  // ใช้ภายในระบบ (วิเคราะห์ผู้เรียน) จึงไม่ตรวจสิทธิ์ซ้ำ ผู้เรียกต้องตรวจสิทธิ์ของตนเอง
  function studentSummaries(academicYearId, homeroomId) {
    var courses = SheetRepository.all('Courses').filter(function (course) {
      return String(course.academicYearId) === String(academicYearId) && (!homeroomId || String(course.homeroomId) === String(homeroomId));
    });
    var sheets = {};
    SheetRepository.all('GradeSheets').forEach(function (row) { sheets[row.courseId] = row; });
    var result = {};
    courses.forEach(function (course) {
      if (!sheets[course.id]) return;
      var scores = {};
      try { scores = JSON.parse(sheets[course.id].scoresJson || '{}'); } catch (error) { scores = {}; }
      Object.keys(scores).forEach(function (studentId) {
        var grade = computeRow(course, scores[studentId]).grade;
        if (!grade) return;
        var item = result[studentId] = result[studentId] || { credits: 0, points: 0, low: [] };
        if (['0', 'ร', 'มส', 'มผ'].indexOf(grade) !== -1) item.low.push(course.subjectName + ' ' + grade);
        if (course.subjectType !== 'กิจกรรม' && /^[0-9.]+$/.test(grade)) {
          item.credits += Number(course.credit) || 0;
          item.points += (Number(course.credit) || 0) * Number(grade);
        }
      });
    });
    Object.keys(result).forEach(function (studentId) {
      var item = result[studentId];
      result[studentId] = { gpa: item.credits ? Math.round(item.points * 100 / item.credits) / 100 : null, low: item.low };
    });
    return result;
  }

  return { gradeOf: gradeOf, computeRow: computeRow, getSheet: getSheet, saveSheet: saveSheet,
    courseReport: courseReport, studentReport: studentReport, studentSummaries: studentSummaries };
})();
