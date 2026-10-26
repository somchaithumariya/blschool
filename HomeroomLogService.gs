/**
 * บันทึกโฮมรูมรายวัน: ข้อมูลประกอบหน้าบันทึก (บันทึกจริงผ่าน entity.save ของ 'homeroom-logs')
 * - รายชื่อนักเรียนในห้อง สำหรับเลือก "นักเรียนที่ต้องติดตาม"
 * - จำนวน มา/สาย/ลา/ขาด จากการเช็กชื่อคาบแรกของวันนั้น (ถ้าเช็กชื่อแล้ว) ครูแก้เองได้
 * - วันที่บันทึกแล้วในเดือนเดียวกัน (ปฏิทินในหน้า) และวันหยุดจากปฏิทินโรงเรียน
 */
var HomeroomLogService = (function () {
  'use strict';

  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function parse(json) { try { return JSON.parse(json || '{}') || {}; } catch (error) { return {}; } }

  // การเช็กชื่อคาบแรกของวัน (คาบเลขน้อยที่สุดที่บันทึกไว้)
  function firstPeriod(date, homeroomId) {
    var sessions = AttendanceService.sessionsInRange(date, date, homeroomId, false)
      .sort(function (a, b) { return Number(a.period) - Number(b.period); });
    if (!sessions.length) return null;
    var summary = parse(sessions[0].summaryJson);
    return { period: Number(sessions[0].period), present: Number(summary.P) || 0, late: Number(summary.L) || 0,
      leave: Number(summary.E) || 0, absent: Number(summary.A) || 0, total: Number(summary.total) || 0 };
  }

  function holidayOn(date) {
    var found = SheetRepository.all('CalendarEvents').filter(function (row) {
      var end = row.endDate || row.eventDate;
      return row.blocksAttendance === true && row.eventDate <= date && end >= date;
    })[0];
    return found ? String(found.name || '') : '';
  }

  function day(token, data) {
    var context = AuthService.requirePermission(token, 'homeroomLog.view');
    var payload = data || {};
    var date = String(payload.date || '');
    if (!DATE_PATTERN.test(date)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาระบุวันที่', { date: 'กรุณาระบุวันที่' });
    var room = payload.homeroomId ? SheetRepository.findById('Homerooms', payload.homeroomId) : null;
    if (!room) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบห้องเรียน', { homeroomId: 'กรุณาเลือกห้องเรียน' });
    var month = date.slice(0, 7);
    var logs = SheetRepository.all('HomeroomLogs').filter(function (row) { return String(row.homeroomId) === String(room.id); });
    var own = String(context.user.personnelId || '');
    return {
      room: { id: room.id, label: room.gradeLevel + '/' + room.roomName, academicYearId: room.academicYearId,
        advisorId: room.advisorId, coAdvisorId: room.coAdvisorId },
      record: logs.filter(function (row) { return row.logDate === date; })[0] || null,
      recordedDates: logs.filter(function (row) { return String(row.logDate).slice(0, 7) === month; })
        .map(function (row) { return row.logDate; }).sort(),
      roster: AttendanceService.roster(room.academicYearId, room.id),
      attendance: firstPeriod(date, room.id),
      holiday: holidayOn(date),
      canEdit: Core.hasPermission(context.permissions, 'homeroomLog.edit') &&
        (Core.hasPermission(context.permissions, 'homeroom.edit') || (!!own && (String(room.advisorId) === own || String(room.coAdvisorId) === own)))
    };
  }

  return { day: day };
})();
