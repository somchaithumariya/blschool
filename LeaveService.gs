/**
 * ข้อมูลประกอบใบลา (แบบใบลาตามระเบียบสำนักนายกรัฐมนตรีว่าด้วยการลาของข้าราชการ พ.ศ. 2555)
 * หน้าเว็บใช้สร้างใบลาเป็น PDF: ชื่อ ตำแหน่ง สถิติการลาในปีงบประมาณ การลาครั้งสุดท้าย และลายเซ็น (ถ้ามีในเมนูลายเซ็น)
 */
var LeaveService = (function () {
  'use strict';

  var DATE = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_SIGNATURE_BYTES = 400000;

  function labelOf(list, id) {
    var item = (list || []).filter(function (entry) { return String(entry.id) === String(id); })[0];
    return item ? item.label : '';
  }

  // ปีงบประมาณ: 1 ต.ค. – 30 ก.ย.
  function fiscalYear(iso) {
    var year = Number(iso.slice(0, 4));
    var month = Number(iso.slice(5, 7));
    var start = month >= 10 ? year : year - 1;
    return { from: start + '-10-01', to: (start + 1) + '-09-30', label: String(start + 1 + 543) };
  }

  function signatureOf(personnelId) {
    if (!personnelId) return '';
    var row = SheetRepository.all('Signatures').filter(function (item) { return String(item.personnelId) === String(personnelId); })[0];
    if (!row || !row.signatureFileId) return '';
    try {
      var blob = DriveApp.getFileById(row.signatureFileId).getBlob();
      var bytes = blob.getBytes();
      if (bytes.length > MAX_SIGNATURE_BYTES) return '';
      return 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(bytes);
    } catch (error) { return ''; }
  }

  function formData(token, data) {
    var context = AuthService.requirePermission(token, 'leave.view');
    data = data || {};
    var personnelId = String(data.personnelId || '');
    var person = SheetRepository.findById('Personnel', personnelId);
    if (!person) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบข้อมูลบุคลากร');
    var approver = Core.hasPermission(context.permissions, 'leave.approve');
    var self = String(context.user.personnelId || '') === personnelId;
    if (!self && !approver) throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่มีสิทธิ์สร้างใบลาของผู้อื่น');
    var fromDate = DATE.test(String(data.fromDate || '')) ? String(data.fromDate) : Core.nowIso().slice(0, 10);
    var fiscal = fiscalYear(fromDate);
    var lookups = EntityService.buildCachedLookups();
    var settings = SettingsService.getPublicSettings();
    var mine = SheetRepository.all('LeaveRequests').filter(function (row) {
      return String(row.personnelId) === personnelId && row.status === 'อนุมัติ' && String(row.id) !== String(data.excludeId || '');
    });
    var stats = {};
    mine.filter(function (row) { return row.fromDate >= fiscal.from && row.fromDate <= fiscal.to; }).forEach(function (row) {
      stats[row.leaveType] = (stats[row.leaveType] || 0) + (Number(row.days) || 0);
    });
    var last = mine.filter(function (row) { return row.leaveType === data.leaveType && String(row.toDate || row.fromDate) < fromDate; })
      .sort(function (a, b) { return String(b.fromDate).localeCompare(String(a.fromDate)); })[0] || null;
    return {
      name: labelOf(lookups.personnel, personnelId) || ((person.firstName || '') + ' ' + (person.lastName || '')).trim(),
      position: [labelOf(lookups.positions, person.positionId), labelOf(lookups.standings, person.standingId)].filter(Boolean).join(' วิทยฐานะ'),
      schoolName: settings.schoolName || '', affiliation: settings.schoolAffiliation || '', directorName: settings.directorName || '',
      fiscalYear: fiscal.label, stats: stats,
      last: last ? { fromDate: last.fromDate, toDate: last.toDate, days: last.days } : null,
      applicantSignature: signatureOf(personnelId),
      approverName: context.user.displayName || context.user.username,
      approverSignature: approver && data.withApprover ? signatureOf(context.user.personnelId) : ''
    };
  }

  return { formData: formData, fiscalYear: fiscalYear, signatureOf: signatureOf };
})();
