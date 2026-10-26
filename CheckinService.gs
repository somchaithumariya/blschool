// ลงเวลามาทำงานของบุคลากร (ไม่ถ่ายรูป เพื่อให้เร็ว): เข้างาน/ออกงานด้วยเวลาของเซิร์ฟเวอร์ ตรวจพิกัด GPS ได้ถ้าผู้ดูแลระบบเปิดใช้
// รายงานรายวัน/รายสัปดาห์/รายเดือน/รายภาคเรียน: มาปกติ มาสาย ไปราชการ ลา ขาด (ขาด = วันทำงานที่ไม่มีการลงเวลา)
var CheckinService = (function () {
  'use strict';

  var CONFIG_PROPERTY = 'CHECKIN_CONFIG';
  var DEFAULTS = { startTime: '08:00', lateTime: '08:30', endTime: '16:30', useGps: false, latitude: '', longitude: '', radius: 200 };
  var STATUSES = ['มาปกติ', 'มาสาย', 'ไปราชการ', 'ลา'];
  var TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function readConfig() {
    var stored = {};
    try { stored = JSON.parse(Tenant.props().getProperty(CONFIG_PROPERTY) || '{}') || {}; } catch (error) { stored = {}; }
    return Object.assign({}, DEFAULTS, stored);
  }
  function now() { var date = new Date(); return { date: Utilities.formatDate(date, 'Asia/Bangkok', 'yyyy-MM-dd'), time: Utilities.formatDate(date, 'Asia/Bangkok', 'HH:mm') }; }

  // ตำแหน่งโรงเรียน (ใช้เป็นจุดกึ่งกลางแผนที่ด้วย)
  function schoolLocation() {
    var config = readConfig();
    var lat = Number(config.latitude);
    var lng = Number(config.longitude);
    return config.latitude !== '' && config.longitude !== '' && isFinite(lat) && isFinite(lng) ? { lat: lat, lng: lng } : null;
  }

  function getConfig(token) {
    AuthService.requirePermission(token, 'checkin.view');
    return readConfig();
  }

  function saveConfig(token, data) {
    var context = AuthService.requirePermission(token, 'checkinReport.manage');
    var input = data || {};
    var errors = {};
    ['startTime', 'lateTime', 'endTime'].forEach(function (key) { if (!TIME.test(String(input[key] || ''))) errors[key] = 'รูปแบบเวลา เช่น 08:30'; });
    if (!errors.startTime && !errors.lateTime && input.lateTime < input.startTime) errors.lateTime = 'เวลาสายต้องไม่ก่อนเวลาเข้างาน';
    var radius = Number(input.radius);
    if (!isFinite(radius) || radius < 20 || radius > 5000) errors.radius = 'รัศมี 20–5,000 เมตร';
    var lat = String(input.latitude || '').trim();
    var lng = String(input.longitude || '').trim();
    if ((lat || lng) && (!isFinite(Number(lat)) || !isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180 || !lat || !lng)) {
      errors.latitude = 'พิกัดโรงเรียนไม่ถูกต้อง';
    }
    if (input.useGps === true && (!lat || !lng)) errors.latitude = 'เปิดตรวจพิกัดต้องกำหนดพิกัดโรงเรียนก่อน';
    if (Object.keys(errors).length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบการตั้งค่า', errors);
    var config = { startTime: input.startTime, lateTime: input.lateTime, endTime: input.endTime, useGps: input.useGps === true,
      latitude: lat, longitude: lng, radius: Math.round(radius) };
    Tenant.props().setProperty(CONFIG_PROPERTY, JSON.stringify(config));
    AuditService.write('CHECKIN_CONFIG', 'Settings', 'checkin', {}, context.user.id);
    return config;
  }

  function distanceMeters(lat1, lng1, lat2, lng2) {
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function requireLinked(context) {
    if (!context.user.personnelId) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'บัญชีของคุณยังไม่ได้ผูกกับทะเบียนบุคลากร กรุณาแจ้งผู้ดูแลระบบ (เมนูผู้ใช้งาน → แก้ไข → บุคลากร)');
    }
    return String(context.user.personnelId);
  }

  function recordOf(personnelId, date) {
    return SheetRepository.findByField('StaffCheckins', 'checkDate', date).filter(function (row) { return String(row.personnelId) === personnelId; })[0] || null;
  }

  function today(token) {
    var context = AuthService.requirePermission(token, 'checkin.view');
    var clock = now();
    var config = readConfig();
    var personnelId = context.user.personnelId ? String(context.user.personnelId) : '';
    var month = clock.date.slice(0, 7);
    var history = personnelId ? SheetRepository.all('StaffCheckins').filter(function (row) {
      return String(row.personnelId) === personnelId && String(row.checkDate).slice(0, 7) === month;
    }).sort(function (a, b) { return String(b.checkDate).localeCompare(String(a.checkDate)); }) : [];
    return { linked: Boolean(personnelId), date: clock.date, time: clock.time, config: { startTime: config.startTime, lateTime: config.lateTime,
      endTime: config.endTime, useGps: config.useGps, radius: config.radius },
      record: personnelId ? recordOf(personnelId, clock.date) : null,
      history: history.map(function (row) { return { checkDate: row.checkDate, checkIn: row.checkIn, checkOut: row.checkOut, status: row.status, note: row.note }; }) };
  }

  function checkLocation(config, data) {
    if (!config.useGps) return { latitude: '', longitude: '', distance: '' };
    var lat = Number(data && data.latitude);
    var lng = Number(data && data.longitude);
    if (!isFinite(lat) || !isFinite(lng) || (data.latitude === '' || data.latitude === undefined)) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'ระบบต้องใช้ตำแหน่ง GPS กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์แล้วลองใหม่');
    }
    var distance = distanceMeters(lat, lng, Number(config.latitude), Number(config.longitude));
    if (distance > config.radius) throw SheetRepository.serviceError('VALIDATION_ERROR', 'คุณอยู่ห่างจากโรงเรียน ' + distance + ' เมตร (ลงเวลาได้ในรัศมี ' + config.radius + ' เมตร)');
    return { latitude: String(Math.round(lat * 1e6) / 1e6), longitude: String(Math.round(lng * 1e6) / 1e6), distance: distance };
  }

  function checkIn(token, data) {
    var context = AuthService.requirePermission(token, 'checkin.view');
    var personnelId = requireLinked(context);
    var config = readConfig();
    var location = checkLocation(config, data);
    // หน้าเว็บปิดปุ่มระหว่างส่ง และตรวจซ้ำที่นี่ (ตารางนี้ 1 แถวต่อคนต่อวัน)
    var clock = now();
    if (recordOf(personnelId, clock.date)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'วันนี้คุณลงเวลาเข้างานแล้ว');
    var status = clock.time <= config.lateTime ? 'มาปกติ' : 'มาสาย';
    var record = SheetRepository.insert('StaffCheckins', { checkDate: clock.date, personnelId: personnelId, userId: context.user.id, checkIn: clock.time,
      checkOut: '', status: status, latitude: location.latitude, longitude: location.longitude, distance: location.distance,
      note: String((data && data.note) || '').slice(0, 200) }, context.user.id);
    return { record: record, status: status, time: clock.time };
  }

  function checkOut(token, data) {
    var context = AuthService.requirePermission(token, 'checkin.view');
    var personnelId = requireLinked(context);
    checkLocation(readConfig(), data);
    var clock = now();
    var record = recordOf(personnelId, clock.date);
    if (!record) throw SheetRepository.serviceError('VALIDATION_ERROR', 'วันนี้ยังไม่ได้ลงเวลาเข้างาน');
    var saved = SheetRepository.update('StaffCheckins', record.id, { checkOut: clock.time }, record.version, context.user.id);
    return { record: saved, time: clock.time };
  }

  // วันทำงาน: จันทร์–ศุกร์ ที่ไม่ใช่วันหยุดในปฏิทินโรงเรียน
  function workingDays(from, to) {
    var holidays = SheetRepository.all('CalendarEvents').filter(function (row) { return row.blocksAttendance === true; });
    var days = [];
    var cursor = new Date(from + 'T00:00:00Z');
    var end = new Date(to + 'T00:00:00Z');
    for (var guard = 0; cursor <= end && guard < 400; guard += 1) {
      var text = cursor.toISOString().slice(0, 10);
      var weekday = cursor.getUTCDay();
      var closed = holidays.some(function (row) { return row.eventDate <= text && (row.endDate || row.eventDate) >= text; });
      if (weekday !== 0 && weekday !== 6 && !closed) days.push(text);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }

  function minutes(time) { var parts = String(time || '').split(':'); return parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : null; }

  function report(token, data) {
    AuthService.requirePermission(token, 'checkinReport.view');
    var payload = data || {};
    if (!DATE.test(String(payload.from || '')) || !DATE.test(String(payload.to || '')) || payload.to < payload.from) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'ช่วงวันที่ไม่ถูกต้อง');
    }
    if ((Date.parse(payload.to) - Date.parse(payload.from)) / 86400000 > 370) throw SheetRepository.serviceError('VALIDATION_ERROR', 'เลือกช่วงวันที่ได้ไม่เกิน 1 ปี');
    var config = readConfig();
    var clock = now();
    var days = workingDays(payload.from, payload.to);
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var positions = EntityService.indexBy(SheetRepository.all('Positions'));
    var records = {};
    SheetRepository.all('StaffCheckins').forEach(function (row) {
      if (row.checkDate < payload.from || row.checkDate > payload.to) return;
      (records[row.personnelId] = records[row.personnelId] || {})[row.checkDate] = { checkIn: row.checkIn, checkOut: row.checkOut, status: row.status, note: row.note };
    });
    // วันนี้นับว่าขาดเมื่อเลยเวลาเลิกงานแล้วเท่านั้น
    var countable = days.filter(function (day) { return day < clock.date || (day === clock.date && clock.time >= config.endTime); });
    var people = SheetRepository.all('Personnel').sort(function (a, b) { return String(a.personnelCode).localeCompare(String(b.personnelCode), 'th', { numeric: true }); })
      .map(function (person) {
        var own = records[person.id] || {};
        var counts = { 'มาปกติ': 0, 'มาสาย': 0, 'ไปราชการ': 0, 'ลา': 0, 'ขาด': 0 };
        var times = [];
        countable.forEach(function (day) {
          var record = own[day];
          if (!record) { counts['ขาด'] += 1; return; }
          counts[record.status] = (counts[record.status] || 0) + 1;
          var value = minutes(record.checkIn);
          if (value !== null && (record.status === 'มาปกติ' || record.status === 'มาสาย')) times.push(value);
        });
        var average = times.length ? Math.round(times.reduce(function (sum, value) { return sum + value; }, 0) / times.length) : null;
        return { personnelId: person.id, code: person.personnelCode, name: (((titles[person.titleId] || {}).name) || '') + person.firstName + ' ' + person.lastName,
          position: (positions[person.positionId] || {}).name || '', counts: counts,
          averageIn: average === null ? '' : ('0' + Math.floor(average / 60)).slice(-2) + ':' + ('0' + (average % 60)).slice(-2), records: own };
      });
    return { from: payload.from, to: payload.to, days: days, countedDays: countable.length, config: config, statuses: STATUSES, people: people };
  }

  // ผู้ดูแลระบบบันทึก/แก้ไขแทน (ลืมลงเวลา ไปราชการ ลา)
  function manual(token, data) {
    var context = AuthService.requirePermission(token, 'checkinReport.manage');
    var payload = data || {};
    var errors = {};
    if (!SheetRepository.findById('Personnel', payload.personnelId)) errors.personnelId = 'ไม่พบบุคลากร';
    if (!DATE.test(String(payload.checkDate || ''))) errors.checkDate = 'กรุณาระบุวันที่';
    if (STATUSES.indexOf(payload.status) === -1) errors.status = 'กรุณาเลือกสถานะ';
    ['checkIn', 'checkOut'].forEach(function (key) { if (payload[key] && !TIME.test(payload[key])) errors[key] = 'รูปแบบเวลา เช่น 08:15'; });
    if (Object.keys(errors).length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var values = { checkDate: payload.checkDate, personnelId: String(payload.personnelId), checkIn: payload.checkIn || '', checkOut: payload.checkOut || '',
      status: payload.status, note: String(payload.note || 'บันทึกโดยผู้ดูแลระบบ').slice(0, 200) };
    var existing = recordOf(values.personnelId, values.checkDate);
    var saved = existing ? SheetRepository.update('StaffCheckins', existing.id, values, existing.version, context.user.id)
      : SheetRepository.insert('StaffCheckins', Object.assign({ userId: '', latitude: '', longitude: '', distance: '' }, values), context.user.id);
    AuditService.write('CHECKIN_MANUAL', 'StaffCheckins', saved.id, { status: values.status }, context.user.id);
    return { id: saved.id };
  }

  function removeRecord(token, data) {
    var context = AuthService.requirePermission(token, 'checkinReport.manage');
    var record = recordOf(String(data && data.personnelId), String(data && data.checkDate));
    if (!record) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบการลงเวลา');
    SheetRepository.softDelete('StaffCheckins', record.id, record.version, context.user.id);
    AuditService.write('CHECKIN_DELETE', 'StaffCheckins', record.id, {}, context.user.id);
    return { ok: true };
  }

  // ใบลาที่อนุมัติ -> บันทึกสถานะ "ลา"/"ไปราชการ" ในการลงเวลาทุกวันทำการของใบลา (ไม่ทับวันที่ลงเวลามาทำงานจริง)
  // ใบลาที่ถูกเปลี่ยนเป็นไม่อนุมัติ/ลบ/แก้ช่วงวัน: ลบเฉพาะรายการที่ระบบสร้างจากใบลานั้น
  function syncLeave(leave, actorId) {
    var tag = 'ใบลา#' + leave.id;
    var rows = SheetRepository.all('StaffCheckins').filter(function (row) { return String(row.personnelId) === String(leave.personnelId); });
    var approved = leave.status === 'อนุมัติ' && leave.isDeleted !== true && DATE.test(String(leave.fromDate || ''));
    var days = approved ? workingDays(leave.fromDate, DATE.test(String(leave.toDate || '')) ? leave.toDate : leave.fromDate) : [];
    var status = /ไปราชการ/.test(String(leave.leaveType || '')) ? 'ไปราชการ' : 'ลา';
    var taken = {};
    rows.forEach(function (row) {
      if (row.note === tag && days.indexOf(row.checkDate) === -1) { SheetRepository.softDelete('StaffCheckins', row.id, row.version, actorId); return; }
      if (row.note === tag && row.status !== status) SheetRepository.update('StaffCheckins', row.id, { status: status }, row.version, actorId);
      taken[row.checkDate] = true;
    });
    var inserts = days.filter(function (day) { return !taken[day]; }).map(function (day) {
      return { checkDate: day, personnelId: String(leave.personnelId), userId: '', checkIn: '', checkOut: '', status: status,
        latitude: '', longitude: '', distance: '', note: tag };
    });
    SheetRepository.insertMany('StaffCheckins', inserts, actorId);
    return { added: inserts.length, days: days.length };
  }

  return { syncLeave: syncLeave, readConfigForAdmin: readConfig, getConfig: getConfig, saveConfig: saveConfig, today: today, checkIn: checkIn, checkOut: checkOut, report: report, manual: manual,
    removeRecord: removeRecord, schoolLocation: schoolLocation, workingDays: workingDays, distanceMeters: distanceMeters, STATUSES: STATUSES };
})();
