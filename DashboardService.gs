var DashboardService = (function () {
  'use strict';

  function getDashboard(token) {
    var context = AuthService.requirePermission(token, 'dashboard.view');
    var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    var shared = sharedFor(today);
    return {
      today: today,
      counts: shared.counts,
      attendance: shared.attendance,
      announcements: shared.announcements,
      sos: Core.hasPermission(context.permissions, 'sos.manage') ? SosService.openAlerts() : null,
      concerns: ConcernService.dashboardSummary(context),
      pendingRegistrations: Core.hasPermission(context.permissions, 'user.edit')
        ? SheetRepository.all('Users').filter(function (user) { return user.registrationStatus === 'pending'; }).length : 0,
      generatedAt: Core.nowIso()
    };
  }

  function sharedFor(today) {
    return SheetRepository.memoResult('dashboard', function () { return buildShared(today); }, { stamp: today, persist: 'dashboard',
      deps: ['Personnel', 'Positions', 'PersonnelTypes', 'Students', 'Announcements', 'AttendanceSessions', 'TimetableEntries'] });
  }

  function buildShared(today) {
    var personnel = SheetRepository.all('Personnel');
    var positions = EntityService.indexBy(SheetRepository.all('Positions'));
    var types = EntityService.indexBy(SheetRepository.all('PersonnelTypes'));
    var counts = { executives: 0, teachers: 0, staff: 0 };
    personnel.forEach(function (row) {
      var position = positions[row.positionId] ? positions[row.positionId].name : '';
      var type = types[row.personnelTypeId] ? types[row.personnelTypeId].name : '';
      if (/ผู้อำนวยการ/.test(position)) counts.executives += 1;
      else if (/ครู/.test(type) || /ครู/.test(position)) counts.teachers += 1;
      else counts.staff += 1;
    });
    var students = SheetRepository.all('Students').filter(function (row) { return !row.status || row.status === 'กำลังศึกษา'; }).length;
    var announcements = SheetRepository.all('Announcements').filter(function (row) { return !row.publishDate || row.publishDate <= today; })
      .sort(function (a, b) { return (b.isPinned === true) - (a.isPinned === true) || String(b.publishDate).localeCompare(String(a.publishDate)); })
      .slice(0, 5).map(function (row) { return { id: row.id, title: row.title, publishDate: row.publishDate, isPinned: row.isPinned === true, body: row.body }; });
    return {
      counts: { executives: counts.executives, teachers: counts.teachers, staff: counts.staff, students: students },
      attendance: AttendanceService.dashboardSummary(today),
      announcements: announcements
    };
  }

  return { getDashboard: getDashboard, sharedFor: sharedFor };
})();

/**
 * ปุ่มแจ้งเหตุด่วน SOS: ครูกดส่ง ผู้ดูแลระบบ/ผู้บริหารเห็นบนแดชบอร์ด
 */
var SosService = (function () {
  'use strict';

  function send(token, data) {
    var context = AuthService.requirePermission(token, 'dashboard.view');
    var message = String((data && data.message) || '').trim().slice(0, 500);
    var location = String((data && data.location) || '').trim().slice(0, 200);
    if (!message) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาระบุเหตุการณ์', { message: 'กรุณาระบุเหตุการณ์' });
    var record = SheetRepository.insert('SosAlerts', { message: message, location: location, status: 'open', acknowledgedBy: '', acknowledgedAt: '' },
      context.user.id);
    AuditService.write('SOS_SENT', 'SosAlerts', record.id, {}, context.user.id);
    var delivered = NotifyService.notify('sos', '🚨 แจ้งเหตุด่วน SOS\n' + message + (location ? '\nสถานที่: ' + location : '') +
      '\nผู้แจ้ง: ' + (context.user.displayName || context.user.username));
    return { id: record.id, delivered: delivered.map(function (result) { return { channel: result.channel, ok: result.ok }; }) };
  }

  function openAlerts() {
    var users = EntityService.indexBy(SheetRepository.all('Users', { includeDeleted: true }));
    return SheetRepository.all('SosAlerts').filter(function (row) { return row.status === 'open'; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
      .map(function (row) {
        var user = users[row.createdBy];
        return { id: row.id, version: row.version, message: row.message, location: row.location, createdAt: row.createdAt,
          sender: user ? user.displayName || user.username : '' };
      });
  }

  function acknowledge(token, data) {
    var context = AuthService.requirePermission(token, 'sos.manage');
    var alert = SheetRepository.findById('SosAlerts', data && data.id);
    if (!alert) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบรายการแจ้งเหตุ');
    SheetRepository.update('SosAlerts', alert.id, { status: 'acknowledged', acknowledgedBy: context.user.id, acknowledgedAt: Core.nowIso() },
      alert.version, context.user.id);
    return { alerts: openAlerts() };
  }

  return { send: send, openAlerts: openAlerts, acknowledge: acknowledge };
})();
