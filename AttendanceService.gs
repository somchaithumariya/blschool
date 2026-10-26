/**
 * เช็กชื่อรายคาบ บันทึกเวลาเรียน รายงานการมาเรียน และส่งออกข้อมูล
 * สถานะ: P = มา, L = สาย, E = ลา, A = ขาด
 */
var AttendanceService = (function () {
  'use strict';

  var STATUSES = ['P', 'L', 'E', 'A'];
  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  var WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  function sessionKey(date, homeroomId, period) { return date + '|' + homeroomId + '|' + period; }

  function assertDate(value, field) {
    if (!DATE_PATTERN.test(String(value || ''))) {
      var errors = {};
      errors[field || 'date'] = 'กรุณาระบุวันที่';
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    }
  }

  // รายชื่อนักเรียนในห้อง เรียงตามเลขที่
  function roster(academicYearId, homeroomId) {
    var students = EntityService.indexBy(SheetRepository.all('Students'));
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    return SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.academicYearId) === String(academicYearId) && String(row.homeroomId) === String(homeroomId) &&
        row.status !== 'ย้ายออก';
    }).sort(function (a, b) { return Number(a.number) - Number(b.number); }).map(function (row) {
      var student = students[row.studentId] || {};
      var title = titles[student.titleId] ? titles[student.titleId].name : '';
      return { studentId: row.studentId, number: row.number, code: student.studentCode || '',
        name: (title + (student.firstName || '') + ' ' + (student.lastName || '')).trim(), gender: student.gender || '' };
    });
  }

  function getHomeroom(homeroomId) {
    var homeroom = SheetRepository.findById('Homerooms', homeroomId);
    if (!homeroom) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบห้องเรียน', { homeroomId: 'กรุณาเลือกห้องเรียน' });
    return homeroom;
  }

  function getSheet(token, data) {
    AuthService.requirePermission(token, 'attendance.view');
    var payload = data || {};
    assertDate(payload.date);
    var homeroom = getHomeroom(payload.homeroomId);
    var period = Number(payload.period) || 0;
    var existing = SheetRepository.findByField('AttendanceSessions', 'sessionKey', sessionKey(payload.date, homeroom.id, period))[0] || null;
    var weekday = WEEKDAYS[new Date(payload.date + 'T00:00:00').getDay()];
    var scheduled = SheetRepository.all('TimetableEntries').filter(function (row) {
      return String(row.homeroomId) === String(homeroom.id) && row.weekday === weekday && Number(row.period) === period;
    })[0] || null;
    var holiday = SheetRepository.all('CalendarEvents').filter(function (row) {
      var end = row.endDate || row.eventDate;
      return row.blocksAttendance === true && row.eventDate <= payload.date && end >= payload.date;
    })[0] || null;
    var records = {};
    if (existing) { try { records = JSON.parse(existing.recordsJson || '{}'); } catch (error) { records = {}; } }
    return {
      students: roster(homeroom.academicYearId, homeroom.id),
      session: existing ? { id: existing.id, version: existing.version, subjectName: existing.subjectName,
        teacherId: existing.teacherId, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy } : null,
      records: records,
      scheduled: scheduled ? { subjectName: scheduled.subjectName, teacherId: scheduled.teacherId } : null,
      holiday: holiday ? holiday.name : ''
    };
  }

  function saveSheet(token, data) {
    var payload = data || {};
    var context = AuthService.requirePermission(token, 'attendance.add');
    assertDate(payload.date);
    var homeroom = getHomeroom(payload.homeroomId);
    var period = Number(payload.period) || 0;
    var students = roster(homeroom.academicYearId, homeroom.id);
    var input = payload.records || {};
    var records = {};
    var summary = { P: 0, L: 0, E: 0, A: 0, total: students.length };
    students.forEach(function (student) {
      var entry = input[student.studentId] || {};
      var status = STATUSES.indexOf(entry.s) === -1 ? 'P' : entry.s;
      records[student.studentId] = { s: status, n: String(entry.n || '').slice(0, 200) };
      summary[status] += 1;
    });
    var values = {
      sessionKey: sessionKey(payload.date, homeroom.id, period),
      academicYearId: homeroom.academicYearId,
      attendanceDate: payload.date,
      homeroomId: homeroom.id,
      period: period,
      subjectName: String(payload.subjectName || '').slice(0, 150),
      teacherId: String(payload.teacherId || ''),
      summaryJson: JSON.stringify(summary),
      recordsJson: JSON.stringify(records)
    };
    var existing = SheetRepository.findByField('AttendanceSessions', 'sessionKey', values.sessionKey)[0];
    var saved;
    if (existing) {
      if (!Core.hasPermission(context.permissions, 'attendance.edit')) {
        throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่มีสิทธิ์แก้ไขการเช็กชื่อที่บันทึกแล้ว');
      }
      saved = SheetRepository.update('AttendanceSessions', existing.id, values, payload.version || existing.version, context.user.id);
    } else {
      saved = SheetRepository.insert('AttendanceSessions', values, context.user.id);
    }
    return { id: saved.id, version: saved.version, summary: summary };
  }

  // อ่านสรุปทุกคาบในช่วงวันที่ (ไม่โหลด recordsJson ถ้าไม่จำเป็น)
  function sessionsInRange(from, to, homeroomId, withRecords) {
    var rows = withRecords ? SheetRepository.all('AttendanceSessions')
      : SheetRepository.readColumns('AttendanceSessions', ['attendanceDate', 'homeroomId', 'period', 'summaryJson', 'academicYearId']);
    return rows.filter(function (row) {
      return row.attendanceDate >= from && row.attendanceDate <= to && (!homeroomId || String(row.homeroomId) === String(homeroomId));
    });
  }

  function parse(json) { try { return JSON.parse(json || '{}'); } catch (error) { return {}; } }

  function assertRange(payload) {
    assertDate(payload.from, 'from');
    assertDate(payload.to, 'to');
    if (payload.to < payload.from) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ช่วงวันที่ไม่ถูกต้อง', { to: 'วันที่สิ้นสุดต้องไม่ก่อนวันเริ่มต้น' });
    var days = (Date.parse(payload.to) - Date.parse(payload.from)) / 86400000;
    if (days > 400) throw SheetRepository.serviceError('VALIDATION_ERROR', 'เลือกช่วงวันที่ได้ไม่เกิน 1 ปี', { to: 'ช่วงวันที่ยาวเกินไป' });
  }

  // รายงานรายนักเรียน: จำนวนคาบ มา/สาย/ลา/ขาด และร้อยละการมาเรียน
  function studentReport(token, data) {
    AuthService.requirePermission(token, 'attendanceReport.view');
    var payload = data || {};
    assertRange(payload);
    var homeroom = getHomeroom(payload.homeroomId);
    var students = roster(homeroom.academicYearId, homeroom.id);
    var counts = {};
    students.forEach(function (student) { counts[student.studentId] = { P: 0, L: 0, E: 0, A: 0 }; });
    var sessions = sessionsInRange(payload.from, payload.to, homeroom.id, true);
    sessions.forEach(function (session) {
      var records = parse(session.recordsJson);
      Object.keys(records).forEach(function (studentId) {
        if (counts[studentId] && counts[studentId][records[studentId].s] !== undefined) counts[studentId][records[studentId].s] += 1;
      });
    });
    return {
      sessionCount: sessions.length,
      rows: students.map(function (student) {
        var count = counts[student.studentId];
        var total = count.P + count.L + count.E + count.A;
        return Object.assign({}, student, count, { total: total, rate: total ? Math.round((count.P + count.L) * 1000 / total) / 10 : null });
      })
    };
  }

  // สรุปมาสาย/ขาดเรียน ทุกห้อง (หรือห้องเดียว) เรียงจากมากไปน้อย
  function lateAbsence(token, data) {
    AuthService.requirePermission(token, 'attendanceReport.view');
    var payload = data || {};
    assertRange(payload);
    var sessions = sessionsInRange(payload.from, payload.to, payload.homeroomId, true);
    var counts = {};
    sessions.forEach(function (session) {
      var records = parse(session.recordsJson);
      Object.keys(records).forEach(function (studentId) {
        var status = records[studentId].s;
        if (status !== 'L' && status !== 'A') return;
        var count = counts[studentId] = counts[studentId] || { L: 0, A: 0, homeroomId: session.homeroomId, dates: {} };
        count[status] += 1;
        count.dates[session.attendanceDate] = true;
      });
    });
    var threshold = Math.max(1, Number(payload.minCount) || 1);
    return { rows: Object.keys(counts).map(function (studentId) {
      var count = counts[studentId];
      return { studentId: studentId, homeroomId: count.homeroomId, L: count.L, A: count.A, days: Object.keys(count.dates).length };
    }).filter(function (row) { return row.L + row.A >= threshold; })
      .sort(function (a, b) { return (b.A + b.L) - (a.A + a.L); }) };
  }

  // บันทึกเวลาเรียนรายเดือน: สถานะรายวันของนักเรียนแต่ละคน (สถานะที่หนักที่สุดของวันนั้น)
  function register(token, data) {
    AuthService.requirePermission(token, 'attendance.view');
    var payload = data || {};
    if (!/^\d{4}-\d{2}$/.test(String(payload.month || ''))) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกเดือน', { month: 'กรุณาเลือกเดือน' });
    }
    var homeroom = getHomeroom(payload.homeroomId);
    var students = roster(homeroom.academicYearId, homeroom.id);
    var from = payload.month + '-01';
    var to = payload.month + '-31';
    var weight = { P: 0, E: 1, L: 2, A: 3 };
    var days = {};
    var grid = {};
    sessionsInRange(from, to, homeroom.id, true).forEach(function (session) {
      var day = Number(String(session.attendanceDate).slice(8, 10));
      days[day] = true;
      var records = parse(session.recordsJson);
      Object.keys(records).forEach(function (studentId) {
        var row = grid[studentId] = grid[studentId] || {};
        var status = records[studentId].s;
        if (row[day] === undefined || weight[status] > weight[row[day]]) row[day] = status;
      });
    });
    return { days: Object.keys(days).map(Number).sort(function (a, b) { return a - b; }), students: students, grid: grid };
  }

  function exportRows(token, data) {
    AuthService.requirePermission(token, 'attendance.export');
    var payload = data || {};
    assertRange(payload);
    var students = EntityService.indexBy(SheetRepository.all('Students'));
    var homerooms = EntityService.indexBy(SheetRepository.all('Homerooms'));
    var labels = { P: 'มา', L: 'สาย', E: 'ลา', A: 'ขาด' };
    var rows = [];
    sessionsInRange(payload.from, payload.to, payload.homeroomId, true).forEach(function (session) {
      var homeroom = homerooms[session.homeroomId] || {};
      var records = parse(session.recordsJson);
      Object.keys(records).forEach(function (studentId) {
        var student = students[studentId] || {};
        rows.push([session.attendanceDate, (homeroom.gradeLevel || '') + '/' + (homeroom.roomName || ''), session.period,
          session.subjectName, student.studentCode || '', ((student.firstName || '') + ' ' + (student.lastName || '')).trim(),
          labels[records[studentId].s] || '', records[studentId].n || '']);
      });
    });
    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] - b[2]; });
    if (rows.length > 50000) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ข้อมูลมากเกินไป กรุณาเลือกช่วงวันที่สั้นลง');
    return { header: ['วันที่', 'ห้อง', 'คาบ', 'รายวิชา', 'เลขประจำตัว', 'ชื่อ-สกุล', 'สถานะ', 'หมายเหตุ'], rows: rows };
  }

  // สรุปสำหรับแดชบอร์ด: แนวโน้ม 30 วัน สถานะวันนี้ และจำนวนคาบที่เช็กแล้วเทียบกับตารางสอน
  function dashboardSummary(today) {
    var from = Utilities.formatDate(new Date(Date.parse(today + 'T00:00:00') - 29 * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
    var sessions = sessionsInRange(from, today, null, false);
    var byDate = {};
    var todaySummary = { P: 0, L: 0, E: 0, A: 0 };
    var todaySessions = 0;
    sessions.forEach(function (session) {
      var summary = parse(session.summaryJson);
      var day = byDate[session.attendanceDate] = byDate[session.attendanceDate] || { present: 0, total: 0 };
      day.present += (summary.P || 0) + (summary.L || 0);
      day.total += (summary.P || 0) + (summary.L || 0) + (summary.E || 0) + (summary.A || 0);
      if (session.attendanceDate === today) {
        todaySessions += 1;
        STATUSES.forEach(function (status) { todaySummary[status] += summary[status] || 0; });
      }
    });
    var weekday = WEEKDAYS[new Date(today + 'T00:00:00').getDay()];
    var expected = SheetRepository.all('TimetableEntries').filter(function (row) { return row.weekday === weekday; }).length;
    return {
      trend: Object.keys(byDate).sort().map(function (date) {
        return { date: date, rate: byDate[date].total ? Math.round(byDate[date].present * 1000 / byDate[date].total) / 10 : 0 };
      }),
      today: todaySummary,
      sessionsDone: todaySessions,
      sessionsExpected: Math.max(expected, todaySessions)
    };
  }

  // ช่วงวันของภาคเรียน (ไม่เกินวันนี้)
  function termRange(academicYearId) {
    var year = SheetRepository.findById('AcademicYears', academicYearId);
    if (!year) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกปีการศึกษา/ภาคเรียน');
    var toText = function (value) { return value instanceof Date ? Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd') : String(value || '').slice(0, 10); };
    var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    var from = toText(year.startsAt);
    var to = toText(year.endsAt);
    return { year: year, from: from, to: to < today ? to : today };
  }

  function studentNames() {
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    return SheetRepository.all('Students').reduce(function (index, student) {
      index[student.id] = { code: student.studentCode, name: ((titles[student.titleId] ? titles[student.titleId].name : '') + student.firstName + ' ' + student.lastName).trim() };
      return index;
    }, {});
  }

  // นักเรียนที่มีเวลาเรียนต่ำกว่าเกณฑ์ (ค่าเริ่มต้น 80%) ทั้งภาคเรียน ทุกห้องหรือห้องเดียว
  function riskList(token, data) {
    AuthService.requirePermission(token, 'attendanceReport.view');
    var payload = data || {};
    var range = termRange(payload.academicYearId);
    var threshold = Math.min(100, Math.max(1, Number(payload.threshold) || 80));
    var yearId = String(range.year.id);
    var roomKey = String(payload.homeroomId || 'all');
    // อ่านการมาเรียนรายคาบทั้งภาคเรียนมีต้นทุนสูง: ใช้ผลที่คำนวณแล้วจนกว่าจะมีการเช็กชื่อใหม่
    return SheetRepository.memoResult('attRisk:' + yearId + ':' + roomKey + ':' + threshold, function () {
      return computeRisk(payload, range, threshold, yearId);
    }, { stamp: range.to, persist: roomKey === 'all' ? 'attRisk:' + yearId + ':' + threshold : '',
      deps: ['AttendanceSessions', 'AttendanceSummaries', 'Students', 'Titles', 'Homerooms', 'StudentEnrollments', 'AcademicYears'] });
  }

  // ร้อยละการมาเรียนของนักเรียนทุกคนทั้งภาคเรียน (ใช้ภายในระบบ เช่น วิเคราะห์ผู้เรียน) เก็บผลไว้จนกว่าจะมีการเช็กชื่อใหม่
  function attendanceRates(academicYearId, homeroomId) {
    var range = termRange(academicYearId);
    var yearId = String(range.year.id);
    var roomKey = String(homeroomId || 'all');
    return SheetRepository.memoResult('attRisk:' + yearId + ':' + roomKey + ':101', function () {
      return computeRisk({ homeroomId: homeroomId || '' }, range, 101, yearId);
    }, { stamp: range.to, deps: ['AttendanceSessions', 'AttendanceSummaries', 'Students', 'Titles', 'Homerooms', 'StudentEnrollments', 'AcademicYears'] });
  }

  function computeRisk(payload, range, threshold, yearId) {
    var counts = {};
    var add = function (studentId, status, amount) {
      var count = counts[studentId] = counts[studentId] || { P: 0, L: 0, E: 0, A: 0 };
      if (count[status] !== undefined) count[status] += amount;
    };
    if (range.from <= range.to) {
      sessionsInRange(range.from, range.to, payload.homeroomId, true).forEach(function (session) {
        if (String(session.academicYearId) !== yearId) return;
        var records = parse(session.recordsJson);
        Object.keys(records).forEach(function (studentId) { add(studentId, records[studentId].s, 1); });
      });
    }
    // ข้อมูลที่เก็บถาวรหลังปิดปีการศึกษา
    SheetRepository.all('AttendanceSummaries').forEach(function (row) {
      if (String(row.academicYearId) !== yearId || (payload.homeroomId && String(row.homeroomId) !== String(payload.homeroomId))) return;
      add(row.studentId, 'P', Number(row.present) || 0); add(row.studentId, 'L', Number(row.late) || 0);
      add(row.studentId, 'E', Number(row.leave) || 0); add(row.studentId, 'A', Number(row.absent) || 0);
    });
    var names = studentNames();
    var rooms = EntityService.indexBy(SheetRepository.all('Homerooms'));
    var place = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      if (String(row.academicYearId) === yearId) place[row.studentId] = { homeroomId: row.homeroomId, number: row.number };
    });
    var rows = Object.keys(counts).map(function (studentId) {
      var count = counts[studentId];
      var total = count.P + count.L + count.E + count.A;
      var room = place[studentId] ? rooms[place[studentId].homeroomId] : null;
      return Object.assign({ studentId: studentId, code: (names[studentId] || {}).code || '', name: (names[studentId] || {}).name || '',
        room: room ? room.gradeLevel + '/' + room.roomName : '', number: place[studentId] ? place[studentId].number : '', total: total,
        rate: total ? Math.round((count.P + count.L) * 1000 / total) / 10 : 0 }, count);
    }).filter(function (row) { return row.total > 0 && row.rate < threshold; })
      .sort(function (a, b) { return a.rate - b.rate; });
    return { from: range.from, to: range.to, threshold: threshold, rows: rows };
  }

  // ประวัติการมาเรียนของนักเรียน 1 คน ในภาคเรียนที่เลือก
  function studentHistory(token, data) {
    AuthService.requirePermission(token, 'attendanceReport.view');
    var payload = data || {};
    var range = termRange(payload.academicYearId);
    var yearId = String(range.year.id);
    var studentId = String(payload.studentId || '');
    var enrollment = SheetRepository.all('StudentEnrollments').filter(function (row) {
      return String(row.studentId) === studentId && String(row.academicYearId) === yearId;
    })[0];
    if (!enrollment) throw SheetRepository.serviceError('VALIDATION_ERROR', 'นักเรียนคนนี้ไม่มีรายชื่อในห้องเรียนของภาคเรียนที่เลือก');
    var totals = { P: 0, L: 0, E: 0, A: 0 };
    var entries = [];
    if (range.from <= range.to) {
      sessionsInRange(range.from, range.to, enrollment.homeroomId, true).forEach(function (session) {
        var record = parse(session.recordsJson)[studentId];
        if (!record || totals[record.s] === undefined) return;
        totals[record.s] += 1;
        if (record.s !== 'P') entries.push({ date: session.attendanceDate, period: session.period, subjectName: session.subjectName || '', status: record.s, note: record.n || '' });
      });
    }
    var total = totals.P + totals.L + totals.E + totals.A;
    var names = studentNames();
    return { student: Object.assign({ id: studentId }, names[studentId] || {}), homeroomId: enrollment.homeroomId, number: enrollment.number,
      from: range.from, to: range.to, totals: totals, total: total, rate: total ? Math.round((totals.P + totals.L) * 1000 / total) / 10 : null,
      entries: entries.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || Number(a.period) - Number(b.period); }) };
  }

  return { getSheet: getSheet, saveSheet: saveSheet, studentReport: studentReport, lateAbsence: lateAbsence,
    register: register, exportRows: exportRows, dashboardSummary: dashboardSummary, roster: roster, riskList: riskList, studentHistory: studentHistory,
    sessionsInRange: sessionsInRange, attendanceRates: attendanceRates };
})();
