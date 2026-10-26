/**
 * ศูนย์ผู้ดูแลระบบ: สุขภาพระบบ (ขนาดข้อมูล แคช ผลสรุป) ตรวจความถูกต้องของข้อมูล อุ่นระบบ และข้อความบนหน้าจอที่ผู้ดูแลแก้ไขเองได้
 */
var AdminService = (function () {
  'use strict';

  var SHEET_CELL_LIMIT = 10000000;
  var WARM_PROPERTY = 'WARM_AT';

  function props() { return Tenant.props(); }
  function today() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }

  // ---------- อุ่นระบบ ----------
  // โหลดตารางที่ยังไม่อยู่ในแคช และคำนวณผลที่ใช้บ่อย (รายการอ้างอิง หน้าแรก แดชบอร์ด) ไว้ล่วงหน้า
  function warmAll(source) {
    var started = Date.now();
    var tables = SheetRepository.warmTables();
    ['lookups', 'landing', 'dashboard'].forEach(function (name) {
      try {
        if (name === 'lookups') EntityService.buildCachedLookups();
        else if (name === 'landing') LandingService.get();
        else DashboardService.sharedFor(today());
      } catch (error) { console.error('warm ' + name + ': ' + error.message); }
    });
    var info = { at: Core.nowIso(), source: source || 'web', loaded: tables.loaded, cached: tables.cached, ms: Date.now() - started };
    try { props().setProperty(WARM_PROPERTY, JSON.stringify(info)); } catch (error) { /* ignore */ }
    return info;
  }

  // หน้าเว็บเรียกเบื้องหลังหลังเข้าสู่ระบบ (ผู้ใช้ทุกคน ไม่ส่งข้อมูลใดกลับ นอกจากสถิติการอุ่น)
  function warm(token) {
    AuthService.requireSession(token);
    return warmAll('web');
  }

  function lastWarm() {
    try { return JSON.parse(props().getProperty(WARM_PROPERTY) || 'null'); } catch (error) { return null; }
  }

  // ---------- สุขภาพระบบ ----------
  function sheetStats() {
    var cache = Tenant.cache();
    try { var hit = JSON.parse(cache.get('admin:sheetstats') || 'null'); if (hit) return hit; } catch (error) { /* อ่านใหม่ */ }
    var spreadsheet = SheetRepository.getSpreadsheet();
    var sheets = spreadsheet.getSheets().map(function (sheet) {
      var rows = sheet.getLastRow();
      return { name: sheet.getName(), rows: Math.max(0, rows - 1), cells: sheet.getMaxRows() * sheet.getMaxColumns() };
    }).sort(function (a, b) { return b.rows - a.rows; });
    var total = sheets.reduce(function (sum, sheet) { return sum + sheet.cells; }, 0);
    var result = { sheets: sheets, cells: total, limit: SHEET_CELL_LIMIT, percent: Math.round(total * 1000 / SHEET_CELL_LIMIT) / 10,
      url: spreadsheet.getUrl ? spreadsheet.getUrl() : '', checkedAt: Core.nowIso() };
    try { cache.put('admin:sheetstats', JSON.stringify(result), 600); } catch (error) { /* ignore */ }
    return result;
  }

  function health(token, data) {
    AuthService.requirePermission(token, 'settings.view');
    if (data && data.refresh) { try { Tenant.cache().remove('admin:sheetstats'); } catch (error) { /* ignore */ } }
    var status = SheetRepository.cacheStatus();
    var names = Object.keys(status);
    var users = SheetRepository.all('Users');
    var versions = SheetRepository.tableVersions();
    var demo = {};
    try { demo = DemoService.status(); } catch (error) { demo = {}; }
    var ai = {};
    try { ai = AiService.status(token); } catch (error) { ai = {}; }
    var closures = SheetRepository.all('YearClosures').sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });
    return {
      storage: sheetStats(),
      cache: { cached: names.filter(function (name) { return status[name]; }).length, total: names.length,
        missing: names.filter(function (name) { return !status[name]; }) },
      summaries: SheetRepository.summaryInfo(),
      bulk: SheetRepository.bulkStatus(),
      warm: lastWarm(),
      writes: Number(versions._all) || 0,
      schemaVersion: APP_CONFIG.SCHEMA_VERSION,
      users: {
        total: users.filter(function (user) { return user.registrationStatus !== 'pending'; }).length,
        pending: users.filter(function (user) { return user.registrationStatus === 'pending'; }).length,
        mustChange: users.filter(function (user) { return user.mustChangePassword === true && user.registrationStatus !== 'pending'; }).length,
        inactive: users.filter(function (user) { return user.isActive === false; }).length
      },
      ai: { ready: Object.keys(ai).filter(function (key) { return ai[key]; }).length, total: APP_CONFIG.AI_FEATURES.length },
      demo: { loaded: demo.loaded === true, counts: demo.counts || {} },
      lastClosure: closures[0] ? { year: closures[0].year, url: closures[0].archiveUrl, at: closures[0].createdAt } : null
    };
  }

  // เทียบการอ่านทางเร็ว (Sheets API) กับการอ่านปกติทุกตาราง ตารางที่ไม่ตรงจะถูกกันไว้ให้อ่านแบบปกติ
  function bulkCheck(token) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var result = SheetRepository.bulkVerify();
    AuditService.write('BULK_READ_CHECK', 'System', '', { checked: result.checked, mismatched: result.mismatched.length }, context.user.id);
    return result;
  }

  function clearCache(token) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    SheetRepository.clearAllCaches();
    try { Tenant.cache().remove('admin:sheetstats'); } catch (error) { /* ignore */ }
    AuditService.write('CACHE_CLEARED', 'System', '', {}, context.user.id);
    return warmAll('admin');
  }

  // ลดเซลล์ว่างในฐานข้อมูล (แต่ละแผ่นงานจองไว้ 1,000 แถว x 26 คอลัมน์แม้ยังว่าง) ไม่แตะข้อมูล
  function compact(token) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var result = SheetRepository.compactSheets();
    try { Tenant.cache().remove('admin:sheetstats'); } catch (error) { /* ignore */ }
    AuditService.write('DB_COMPACT', 'System', '', result, context.user.id);
    return Object.assign(result, { storage: sheetStats() });
  }

  // ---------- ตรวจความถูกต้องของข้อมูล ----------
  function issue(level, title, detail, route, count) {
    return { level: level, title: title, detail: detail || '', route: route || '', count: count === undefined ? null : count };
  }

  function checks(token) {
    AuthService.requirePermission(token, 'settings.view');
    var result = [];
    var settings = SettingsService.getPublicSettings();
    var years = SheetRepository.all('AcademicYears');
    var active = years.filter(function (row) { return row.isActive === true; });
    var now = today();

    // ปีการศึกษา
    if (!years.length) result.push(issue('error', 'ยังไม่มีปีการศึกษา', 'เพิ่มปีการศึกษาและภาคเรียนก่อนเริ่มใช้งาน', '#/academic-years'));
    else if (active.length !== 1) result.push(issue('error', 'ต้องมีภาคเรียนปัจจุบัน 1 ภาคเรียน', 'ตอนนี้ตั้งไว้ ' + active.length + ' ภาคเรียน', '#/academic-years'));
    var term = active[0];
    if (term && term.endsAt && String(term.endsAt).slice(0, 10) < now) {
      result.push(issue('warn', 'ภาคเรียนปัจจุบันสิ้นสุดแล้ว', 'ภาคเรียน ' + term.year + '/' + term.term + ' สิ้นสุด ' + String(term.endsAt).slice(0, 10) +
        ' ควรขึ้นภาคเรียนใหม่หรือปิดปีการศึกษา', '#/year-close'));
    }

    // ข้อมูลโรงเรียน
    var missing = [];
    if (!settings.schoolName || settings.schoolName === 'ระบบบริหารจัดการโรงเรียน') missing.push('ชื่อโรงเรียน');
    if (!settings.logoFileId) missing.push('ตราโรงเรียน');
    if (!settings.directorName) missing.push('ชื่อผู้อำนวยการ');
    if (!settings.schoolAddress) missing.push('ที่อยู่');
    if (missing.length) result.push(issue('warn', 'ข้อมูลโรงเรียนยังไม่ครบ', 'ยังไม่ได้กรอก: ' + missing.join(', '), '#/school-profile', missing.length));

    // ผู้ใช้งาน
    var users = SheetRepository.all('Users');
    var userRoles = SheetRepository.all('UserRoles');
    var withRole = userRoles.reduce(function (set, row) { set[row.userId] = true; return set; }, {});
    var pending = users.filter(function (user) { return user.registrationStatus === 'pending'; });
    if (pending.length) result.push(issue('warn', 'มีผู้สมัครรออนุมัติ', pending.length + ' คน', '#/users', pending.length));
    var noRole = users.filter(function (user) { return user.registrationStatus !== 'pending' && !withRole[user.id]; });
    if (noRole.length) result.push(issue('error', 'บัญชีที่ไม่มีบทบาท', 'เข้าสู่ระบบแล้วจะไม่เห็นเมนูใด: ' + names(noRole, 'username'), '#/users', noRole.length));
    var personnel = SheetRepository.all('Personnel');
    var linked = users.reduce(function (set, user) { if (user.personnelId) set[user.personnelId] = true; return set; }, {});
    var noAccount = personnel.filter(function (person) { return !linked[person.id]; });
    if (noAccount.length) result.push(issue('info', 'บุคลากรที่ยังไม่มีบัญชีผู้ใช้', 'กด “สร้างบัญชีให้บุคลากรทั้งหมด” ที่หน้าผู้ใช้งาน', '#/users', noAccount.length));
    var waiting = users.filter(function (user) { return user.mustChangePassword === true && user.registrationStatus !== 'pending'; });
    if (waiting.length) result.push(issue('info', 'บัญชีที่ยังไม่เคยเข้าสู่ระบบ (ยังใช้รหัสผ่านเริ่มต้น)', names(waiting, 'displayName'), '#/users', waiting.length));

    // รหัสซ้ำ
    var dupStudents = duplicates(SheetRepository.all('Students'), 'studentCode');
    if (dupStudents.length) result.push(issue('error', 'เลขประจำตัวนักเรียนซ้ำ', dupStudents.slice(0, 10).join(', '), '#/students', dupStudents.length));
    var dupPersonnel = duplicates(personnel, 'personnelCode');
    if (dupPersonnel.length) result.push(issue('error', 'รหัสบุคลากรซ้ำ', dupPersonnel.slice(0, 10).join(', '), '#/personnel', dupPersonnel.length));

    if (term) {
      var yearId = String(term.id);
      var rooms = SheetRepository.all('Homerooms').filter(function (row) { return String(row.academicYearId) === yearId; });
      var roomIds = EntityService.indexBy(rooms);
      if (!rooms.length) result.push(issue('warn', 'ภาคเรียนปัจจุบันยังไม่มีห้องเรียน', 'สร้างห้องเรียน หรือคัดลอกจากภาคเรียนก่อนที่หน้า “ปิดปีการศึกษา”', '#/homerooms'));
      var noAdvisor = rooms.filter(function (room) { return !room.advisorId; });
      if (noAdvisor.length) result.push(issue('warn', 'ห้องเรียนที่ยังไม่มีครูที่ปรึกษา', noAdvisor.map(function (room) { return room.gradeLevel + '/' + room.roomName; }).join(', '), '#/homerooms', noAdvisor.length));
      var students = SheetRepository.all('Students');
      var studentIds = EntityService.indexBy(students);
      var enrollments = SheetRepository.all('StudentEnrollments').filter(function (row) { return String(row.academicYearId) === yearId; });
      var enrolled = enrollments.reduce(function (set, row) { set[row.studentId] = true; return set; }, {});
      var unplaced = students.filter(function (student) { return (!student.status || student.status === 'กำลังศึกษา') && !enrolled[student.id]; });
      if (unplaced.length) result.push(issue('warn', 'นักเรียนที่ยังไม่มีห้องในภาคเรียนปัจจุบัน', 'เพิ่มที่เมนู “นักเรียนรายห้อง/รายปี”', '#/student-enrollments', unplaced.length));
      var orphans = enrollments.filter(function (row) { return !studentIds[row.studentId] || !roomIds[row.homeroomId]; });
      if (orphans.length) result.push(issue('error', 'รายชื่อนักเรียนรายห้องที่อ้างถึงนักเรียน/ห้องที่ถูกลบ', 'ควรลบหรือแก้ไขรายการเหล่านี้', '#/student-enrollments', orphans.length));
      var clash = {};
      var clashes = 0;
      SheetRepository.all('TimetableEntries').forEach(function (row) {
        if (String(row.academicYearId) !== yearId || !row.teacherId) return;
        var slot = row.teacherId + '|' + row.weekday + '|' + row.period;
        if (clash[slot]) clashes += 1; else clash[slot] = true;
      });
      if (clashes) result.push(issue('warn', 'ครูสอนซ้อนคาบในตารางสอน', 'ครูคนเดียวกันมีมากกว่า 1 ห้องในคาบเดียวกัน', '#/timetable', clashes));
    }
    if (!SheetRepository.all('Periods').length) result.push(issue('warn', 'ยังไม่ได้ตั้งค่าคาบเรียน', '', '#/periods'));

    // ปิดปีการศึกษา
    var closed = SheetRepository.all('YearClosures').reduce(function (set, row) { set[String(row.year)] = true; return set; }, {});
    var oldYears = Object.keys(years.reduce(function (set, row) { set[String(row.year)] = true; return set; }, {}))
      .filter(function (year) { return term && Number(year) < Number(term.year) && !closed[year]; });
    if (oldYears.length) result.push(issue('info', 'ปีการศึกษาเก่าที่ยังไม่ได้ปิดปี', 'ปี ' + oldYears.join(', ') + ' — ปิดปีเพื่อย้ายข้อมูลเก่าออกจากระบบหลัก ระบบจะเร็วขึ้น', '#/year-close', oldYears.length));

    // ขนาดข้อมูล
    var storage = sheetStats();
    if (storage.percent >= 70) result.push(issue(storage.percent >= 90 ? 'error' : 'warn', 'ฐานข้อมูลใกล้เต็ม', 'ใช้ไป ' + storage.percent + '% ของ 10 ล้านเซลล์ ควรปิดปีการศึกษาเพื่อย้ายข้อมูลเก่าออก', '#/year-close'));

    // ข้อมูลตัวอย่าง / AI / ลงเวลา
    try {
      var demo = DemoService.status();
      if (demo.loaded) result.push(issue('info', 'ยังมีข้อมูลตัวอย่างในระบบ', 'ล้างข้อมูลตัวอย่างก่อนเริ่มใช้งานจริง (ไม่กระทบข้อมูลที่โรงเรียนกรอกเอง)', '#/settings'));
    } catch (error) { /* ignore */ }
    var checkin = CheckinService.readConfigForAdmin();
    if (checkin.useGps && !CheckinService.schoolLocation()) result.push(issue('error', 'เปิดตรวจพิกัดลงเวลา แต่ยังไม่ได้ตั้งตำแหน่งโรงเรียน', 'บุคลากรจะลงเวลาไม่ได้', '#/checkin'));

    var order = { error: 0, warn: 1, info: 2 };
    result.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return { items: result, checkedAt: Core.nowIso() };
  }

  function names(rows, key) {
    var list = rows.slice(0, 8).map(function (row) { return row[key] || row.username || ''; });
    return list.join(', ') + (rows.length > 8 ? ' และอีก ' + (rows.length - 8) + ' คน' : '');
  }

  function duplicates(rows, key) {
    var seen = {};
    var dup = {};
    rows.forEach(function (row) {
      var value = String(row[key] || '').trim();
      if (!value) return;
      if (seen[value]) dup[value] = true; else seen[value] = true;
    });
    return Object.keys(dup);
  }

  return { warm: warm, warmAll: warmAll, health: health, checks: checks, clearCache: clearCache, bulkCheck: bulkCheck, compact: compact };
})();

// ตั้งเป็นทริกเกอร์ตามเวลา (เช่น ทุก 1 ชั่วโมง) ได้ที่หน้า Apps Script > ทริกเกอร์ เพื่อให้ระบบพร้อมเร็วตลอดเวลา
function warmSystem() {
  return AdminService.warmAll('trigger');
}
