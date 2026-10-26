/**
 * ขอใช้ระบบและติดตั้งให้โรงเรียนอื่น
 * 1) โรงเรียนเปิดลิงก์ ...?page=register กรอกข้อมูล ผู้อำนวยการลงลายมือชื่อในหนังสือขอใช้ระบบ (หนังสือภายนอก ตามระเบียบงานสารบรรณ)
 * 2) หน้าเว็บสร้างหนังสือเป็น PDF ส่งมาที่นี่ -> เก็บ PDF ใน Drive, บันทึกลงชีตทะเบียนกลาง, ส่งอีเมลพร้อม PDF ถึงเจ้าของระบบ
 * 3) ติดตั้งอัตโนมัติ (หรือรอเจ้าของระบบกดติดตั้ง): สร้างฐานข้อมูลใหม่แยกของโรงเรียนนั้น + บัญชีผู้ดูแลระบบรหัสผ่านสุ่ม
 * 4) ส่งลิงก์ระบบ ชื่อผู้ใช้ และรหัสผ่านไปที่อีเมลผู้ดูแลระบบของโรงเรียน (ต้องเปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก)
 * แต่ละโรงเรียนเข้าได้เฉพาะระบบของตัวเอง (ดู Tenant.gs) ไม่มีรหัสผ่านของโรงเรียนหลักอยู่ในขั้นตอนใดเลย
 */
var DistributionService = (function () {
  'use strict';

  var REGISTRY_SPREADSHEET_ID = '1C1tb46z4Sy2kvuGXq3fkG3M0-rFhKAAdmqKVWsClywk';
  var REGISTRY_SHEET = 'ทะเบียนโรงเรียนที่ใช้ระบบ';
  var MAIN_URL = 'https://script.google.com/macros/s/AKfycbyhNwZZ4BuMj6p0zE0l2BETZRUxoNIfesvje3niJkDy8KHHX5TbkQB3zFLhrGqa80pA2Q/exec';
  var GARUDA_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Garuda_Emblem_of_Thailand_%28Monochrome%29.svg/250px-Garuda_Emblem_of_Thailand_%28Monochrome%29.svg.png';
  var CONFIG_PROPERTY = 'DIST_CONFIG';
  var FOLDER_PROPERTY = 'DIST_FOLDER_IDS';
  var PERMISSION = 'distribution.manage';
  var SYSTEM_NAME = 'ระบบบริหารจัดการสถานศึกษา';
  var OLD_ADDRESSEE = 'ผู้พัฒนาระบบบริหารจัดการสถานศึกษา';
  var DEFAULTS = { ownerEmail: 'pisanpp068@gmail.com', addressee: '', autoApprove: true, dailyLimit: 20, baseUrl: '' };
  function defaultAddressee() { return OLD_ADDRESSEE + ' (' + developerCredit().title + ')'; }

  // [ชื่อช่อง, ชื่อที่แสดง, จำเป็น, ความยาวสูงสุด]
  var FIELDS = [
    ['schoolName', 'ชื่อโรงเรียน', true, 120], ['schoolCode', 'รหัสสถานศึกษา', false, 20], ['affiliation', 'สังกัด', true, 160],
    ['address', 'ที่อยู่', true, 200], ['subdistrict', 'ตำบล/แขวง', true, 80], ['district', 'อำเภอ/เขต', true, 80],
    ['province', 'จังหวัด', true, 80], ['postcode', 'รหัสไปรษณีย์', true, 5], ['schoolPhone', 'โทรศัพท์โรงเรียน', true, 40],
    ['schoolEmail', 'อีเมลโรงเรียน', false, 120], ['directorName', 'ชื่อ-สกุลผู้อำนวยการ', true, 120],
    ['directorPosition', 'ตำแหน่งผู้ลงนาม', true, 160], ['directorPhone', 'โทรศัพท์ผู้อำนวยการ', true, 40],
    ['adminName', 'ชื่อ-สกุลผู้ดูแลระบบ', true, 120], ['adminPosition', 'ตำแหน่งผู้ดูแลระบบ', true, 120],
    ['adminPhone', 'โทรศัพท์ผู้ดูแลระบบ', true, 40], ['adminEmail', 'อีเมลผู้ดูแลระบบ', true, 120],
    ['docNumber', 'เลขที่หนังสือ', false, 60], ['letterDate', 'ลงวันที่', true, 10],
    ['students', 'จำนวนนักเรียน', false, 6], ['teachers', 'จำนวนครูและบุคลากร', false, 6], ['purpose', 'งานที่จะใช้ระบบ', false, 500]
  ];
  var EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
  var ACTIVE_STATES = ['pending', 'installing', 'active'];
  var STATUS_NAMES = { pending: 'รอติดตั้ง', installing: 'กำลังติดตั้ง', active: 'ใช้งาน', failed: 'ติดตั้งไม่สำเร็จ', suspended: 'ระงับการใช้งาน', rejected: 'ไม่อนุมัติ' };

  // ---------- การตั้งค่า (เก็บที่โรงเรียนหลักเสมอ) ----------
  function config() {
    var stored = {};
    try { stored = JSON.parse(Tenant.rawProps().getProperty(CONFIG_PROPERTY) || '{}') || {}; } catch (error) { stored = {}; }
    var result = Object.assign({}, DEFAULTS, stored);
    // ค่าเดิม (ไม่มีชื่อผู้พัฒนาในวงเล็บ) หรือยังไม่ได้ตั้ง: ใช้คำขึ้นต้นมาตรฐานที่มีชื่อผู้พัฒนา
    if (!result.addressee || result.addressee === OLD_ADDRESSEE) result.addressee = defaultAddressee();
    return result;
  }

  function baseUrl() { return config().baseUrl || MAIN_URL; }
  function systemUrl(code) { return code ? baseUrl() + '?s=' + code : baseUrl(); }
  function registerUrl() { return baseUrl() + '?page=register'; }
  function registryUrl() { return 'https://docs.google.com/spreadsheets/d/' + REGISTRY_SPREADSHEET_ID + '/edit'; }

  function requireOwner(token) {
    if (!Tenant.isMain()) throw SheetRepository.serviceError('FORBIDDEN', 'เมนูนี้ใช้ได้เฉพาะผู้ดูแลระบบกลาง');
    return AuthService.requirePermission(token, PERMISSION);
  }

  // ---------- หน้าขอใช้ระบบ ----------
  function registerPage() {
    var template = HtmlService.createTemplateFromFile('Register');
    var settings = config();
    template.boot = JSON.stringify({ addressee: settings.addressee, autoApprove: settings.autoApprove !== false, systemName: SYSTEM_NAME, credit: developerCredit() })
      .replace(/</g, '\\u003c');
    return template.evaluate().setTitle('ขอใช้' + SYSTEM_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  // ตราครุฑสำหรับหัวหนังสือ (ภาพสาธารณสมบัติจาก Wikimedia Commons) ดึงผ่านเซิร์ฟเวอร์เพื่อให้หน้าเว็บวาดลง PDF ได้
  function assets() {
    var cache = Tenant.rawCache();
    var garuda = cache ? cache.get('dist:garuda') : null;
    if (!garuda) {
      try {
        var response = UrlFetchApp.fetch(GARUDA_URL, { muteHttpExceptions: true, followRedirects: true });
        if (response.getResponseCode() === 200) {
          garuda = 'data:image/png;base64,' + Utilities.base64Encode(response.getBlob().getBytes());
          if (cache && garuda.length < 95000) cache.put('dist:garuda', garuda, 21600);
        }
      } catch (error) { garuda = ''; }
    }
    return { garuda: garuda || '', addressee: config().addressee };
  }

  // ---------- ยื่นคำขอ ----------
  function clean(data) {
    var values = {};
    var errors = {};
    FIELDS.forEach(function (field) {
      var value = String(data && data[field[0]] !== undefined && data[field[0]] !== null ? data[field[0]] : '').replace(/\s+/g, ' ').trim();
      if (field[2] && !value) errors[field[0]] = 'กรุณากรอก' + field[1];
      else if (value.length > field[3]) errors[field[0]] = field[1] + 'ยาวเกิน ' + field[3] + ' ตัวอักษร';
      values[field[0]] = value.slice(0, field[3]);
    });
    values.adminEmail = values.adminEmail.toLowerCase();
    if (values.adminEmail && !EMAIL.test(values.adminEmail)) errors.adminEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (values.schoolEmail && !EMAIL.test(values.schoolEmail)) errors.schoolEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (values.postcode && !/^\d{5}$/.test(values.postcode)) errors.postcode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    ['schoolPhone', 'directorPhone', 'adminPhone'].forEach(function (key) {
      if (values[key] && !/^[0-9+#()\- ,]{6,40}$/.test(values[key])) errors[key] = 'กรุณากรอกเบอร์โทรเป็นตัวเลข';
    });
    ['students', 'teachers'].forEach(function (key) { if (values[key] && !/^\d+$/.test(values[key])) errors[key] = 'กรุณากรอกเป็นตัวเลข'; });
    if (values.letterDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.letterDate)) errors.letterDate = 'รูปแบบวันที่ไม่ถูกต้อง';
    if (!data || data.consent !== true) errors.consent = 'กรุณายอมรับข้อตกลงการใช้งาน';
    var signature = String((data && data.signature) || '');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 800) errors.signature = 'กรุณาลงลายมือชื่อผู้อำนวยการ';
    else if (signature.length > 600000) errors.signature = 'ไฟล์ลายมือชื่อใหญ่เกินไป';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลในแบบฟอร์ม', errors);
    return values;
  }

  function pdfBlobOf(data, name) {
    var base64 = String((data && data.pdf) || '');
    if (!base64 || base64.length > 12000000) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบไฟล์หนังสือขอใช้ระบบ กรุณาลองใหม่');
    var bytes;
    try { bytes = Utilities.base64Decode(base64); } catch (error) { bytes = []; }
    if (bytes.length < 1000 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไฟล์หนังสือขอใช้ระบบไม่ถูกต้อง กรุณาลองใหม่');
    }
    return Utilities.newBlob(bytes, 'application/pdf', name);
  }

  function submit(data) {
    if (!Tenant.isMain()) throw SheetRepository.serviceError('FORBIDDEN', 'ยื่นคำขอได้จากหน้าขอใช้ระบบเท่านั้น');
    if (data && String(data.website || '').trim()) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่สามารถส่งคำขอได้');
    var values = clean(data);
    var fileName = 'หนังสือขอใช้ระบบ_' + values.schoolName.replace(/[\\/:*?"<>|]/g, '') + '.pdf';
    var pdf = pdfBlobOf(data, fileName);
    var settings = config();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var code;
    var record;
    try {
      var records = Tenant.allRecords();
      var duplicate = records.filter(function (item) {
        return ACTIVE_STATES.indexOf(item.status) !== -1 && item.adminEmail === values.adminEmail &&
          String(item.schoolName).replace(/\s/g, '') === values.schoolName.replace(/\s/g, '');
      })[0];
      if (duplicate) {
        throw SheetRepository.serviceError('CONFLICT', 'โรงเรียนนี้ยื่นคำขอไว้แล้ว (เลขคำขอ ' + duplicate.requestNo + ' สถานะ: ' +
          (STATUS_NAMES[duplicate.status] || duplicate.status) + ') หากไม่ได้รับอีเมล กรุณาตรวจสอบกล่องจดหมายขยะ');
      }
      var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
      var todayCount = records.filter(function (item) { return String(item.createdAt || '').slice(0, 10) === today; }).length;
      if (todayCount >= Number(settings.dailyLimit || DEFAULTS.dailyLimit)) {
        throw SheetRepository.serviceError('RATE_LIMITED', 'วันนี้มีคำขอครบจำนวนที่รับได้แล้ว กรุณายื่นใหม่ในวันถัดไป');
      }
      code = Tenant.newCode();
      var file = folders().letters.createFile(pdf);
      record = Object.assign({}, values, {
        status: 'pending', requestNo: 'REQ-' + today.replace(/-/g, '') + '-' + code.toUpperCase(), createdAt: Core.nowIso(),
        letterFileId: file.getId(), letterUrl: file.getUrl()
      });
      Tenant.saveRecord(code, record);
    } finally {
      lock.releaseLock();
    }
    writeRegistry(code, record);
    var installed = null;
    if (settings.autoApprove !== false) installed = install(code, pdf);
    record = Tenant.record(code);
    notifyOwner(code, record, pdf);
    if (settings.autoApprove === false) sendReceipt(record);
    return {
      requestNo: record.requestNo, status: record.status, statusName: STATUS_NAMES[record.status] || record.status,
      email: maskEmail(record.adminEmail), installed: !!(installed && installed.ok),
      message: installed && !installed.ok ? 'ได้รับคำขอแล้ว แต่การติดตั้งอัตโนมัติยังไม่สำเร็จ ผู้ดูแลระบบกลางจะตรวจสอบและติดตั้งให้ แล้วแจ้งทางอีเมล' : ''
    };
  }

  // ---------- ติดตั้งระบบให้โรงเรียน ----------
  function install(code, pdf) {
    var record = Tenant.record(code);
    if (!record) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบคำขอ');
    if (record.status === 'active') return { ok: true, already: true };
    record = Tenant.saveRecord(code, Object.assign({}, record, { status: 'installing', error: '' }));
    var password = randomPassword();
    try {
      var base = folders();
      var schoolFolder = record.folderId ? DriveApp.getFolderById(record.folderId)
        : base.schools.createFolder(record.schoolName + ' (' + code + ')');
      var databaseId = record.databaseId;
      if (!databaseId) {
        var spreadsheet = SpreadsheetApp.create('ฐานข้อมูล' + SYSTEM_NAME + ' - ' + record.schoolName);
        databaseId = spreadsheet.getId();
        try { DriveApp.getFileById(databaseId).moveTo(schoolFolder); } catch (error) { /* อยู่ใน My Drive ก็ใช้งานได้ */ }
      }
      record = Tenant.saveRecord(code, Object.assign({}, record, { folderId: schoolFolder.getId(), databaseId: databaseId }));

      Tenant.use(code, { allowInstalling: true, exclusive: true });
      var props = Tenant.props();
      props.setProperty('DATABASE_SPREADSHEET_ID', databaseId);
      props.setProperty('INITIAL_ADMIN_USERNAME', 'admin');
      props.setProperty('DEMO_DONE', '1');
      installSystem({ adminPassword: password });
      props.setProperty('SCHEMA_VERSION', String(APP_CONFIG.SCHEMA_VERSION));
      prepareSchool(record, code, password);
      SheetRepository.clearAllCaches();
    } catch (error) {
      Tenant.use('');
      var message = String(error && error.message ? error.message : error).slice(0, 300);
      record = Tenant.saveRecord(code, Object.assign({}, Tenant.record(code), { status: 'failed', error: message }));
      writeRegistry(code, record);
      console.error(JSON.stringify({ action: 'distribution.install', code: code, message: message }));
      return { ok: false, error: message };
    }
    Tenant.use('');
    record = Tenant.saveRecord(code, Object.assign({}, Tenant.record(code), { status: 'active', installedAt: Core.nowIso(), error: '' }));
    try {
      sendCredentials(record, code, password, pdf || letterBlob(record), false);
      record = Tenant.saveRecord(code, Object.assign({}, record, { credentialsSentAt: Core.nowIso() }));
    } catch (error) {
      record = Tenant.saveRecord(code, Object.assign({}, record, { error: 'ส่งอีเมลไม่สำเร็จ: ' + String(error.message || error).slice(0, 200) }));
    }
    writeRegistry(code, record);
    return { ok: true };
  }

  // ข้อมูลตั้งต้นของโรงเรียนใหม่: ชื่อ ที่อยู่ ผู้บริหาร ลิงก์ระบบ ปีการศึกษาปัจจุบัน และข้อมูลผู้ดูแลระบบ
  function prepareSchool(record, code, password) {
    var values = {
      schoolName: record.schoolName, schoolAffiliation: record.affiliation, schoolCode: record.schoolCode,
      schoolAddress: fullAddress(record), schoolPhone: record.schoolPhone, schoolEmail: record.schoolEmail,
      directorName: record.directorName, systemUrl: systemUrl(code)
    };
    var rows = SheetRepository.all('Settings');
    Object.keys(values).forEach(function (key) {
      var row = rows.filter(function (item) { return item.key === key; })[0];
      var json = JSON.stringify(values[key] || '');
      if (row) SheetRepository.update('Settings', row.id, { valueJson: json }, row.version, 'system');
      else SheetRepository.insert('Settings', { key: key, valueJson: json }, 'system');
    });
    fillSampleLandingContent();
    if (!SheetRepository.all('AcademicYears', { includeDeleted: true }).length) {
      var now = new Date();
      var month = now.getMonth() + 1;
      var year = now.getFullYear() + 543 - (month < 5 ? 1 : 0);
      var term = month >= 5 && month <= 10 ? '1' : '2';
      var gregorian = year - 543;
      SheetRepository.insert('AcademicYears', { year: String(year), term: '1', startsAt: gregorian + '-05-16', endsAt: gregorian + '-10-10', isActive: term === '1' }, 'system');
      SheetRepository.insert('AcademicYears', { year: String(year), term: '2', startsAt: gregorian + '-11-01', endsAt: (gregorian + 1) + '-03-31', isActive: term === '2' }, 'system');
    }
    var admin = SheetRepository.all('Users').filter(function (user) { return user.username === 'admin'; })[0];
    if (admin) {
      SheetRepository.update('Users', admin.id, { displayName: record.adminName, email: record.adminEmail }, admin.version, 'system');
    }
    removeBlankSheets();
    AuditService.write('SCHOOL_PROVISIONED', 'System', code, { requestNo: record.requestNo }, 'system');
  }

  function removeBlankSheets() {
    try {
      var spreadsheet = SpreadsheetApp.openById(Tenant.props().getProperty('DATABASE_SPREADSHEET_ID'));
      spreadsheet.getSheets().forEach(function (sheet) {
        if (!APP_CONFIG.SHEETS[sheet.getName()] && sheet.getLastRow() === 0 && spreadsheet.getSheets().length > 1) spreadsheet.deleteSheet(sheet);
      });
    } catch (error) { /* ไม่กระทบการใช้งาน */ }
  }

  function randomPassword() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
    var text = '';
    for (var index = 0; index < 14; index += 1) text += alphabet.charAt(((bytes[index] + 256) % 256) % alphabet.length);
    // ให้มีทั้งตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลขเสมอ
    return text.slice(0, 11) + 'K' + 'm' + String(((bytes[20] + 256) % 8) + 2);
  }

  // ---------- โฟลเดอร์ใน Drive ของเจ้าของระบบ ----------
  function folders() {
    var ids = {};
    try { ids = JSON.parse(Tenant.rawProps().getProperty(FOLDER_PROPERTY) || '{}') || {}; } catch (error) { ids = {}; }
    var open = function (key, name, parent) {
      if (ids[key]) { try { return DriveApp.getFolderById(ids[key]); } catch (error) { /* สร้างใหม่ */ } }
      var folder = (parent || DriveApp.getRootFolder()).createFolder(name);
      ids[key] = folder.getId();
      return folder;
    };
    var root = open('root', SYSTEM_NAME + ' - โรงเรียนที่ขอใช้ระบบ');
    var result = { root: root, letters: open('letters', 'หนังสือขอใช้ระบบ (PDF)', root), schools: open('schools', 'ฐานข้อมูลของแต่ละโรงเรียน', root) };
    Tenant.rawProps().setProperty(FOLDER_PROPERTY, JSON.stringify(ids));
    return result;
  }

  function letterBlob(record) {
    try { return record.letterFileId ? DriveApp.getFileById(record.letterFileId).getBlob() : null; } catch (error) { return null; }
  }

  // ---------- ชีตทะเบียนกลาง ----------
  var REGISTRY_COLUMNS = [
    ['requestNo', 'เลขคำขอ'], ['createdAt', 'วันที่ยื่นคำขอ'], ['statusName', 'สถานะ'], ['code', 'รหัสระบบ'], ['systemUrl', 'ลิงก์ระบบของโรงเรียน'],
    ['schoolName', 'ชื่อโรงเรียน'], ['schoolCode', 'รหัสสถานศึกษา'], ['affiliation', 'สังกัด'], ['address', 'ที่อยู่'],
    ['subdistrict', 'ตำบล/แขวง'], ['district', 'อำเภอ/เขต'], ['province', 'จังหวัด'], ['postcode', 'รหัสไปรษณีย์'],
    ['schoolPhone', 'โทรศัพท์โรงเรียน'], ['schoolEmail', 'อีเมลโรงเรียน'], ['directorName', 'ผู้อำนวยการ (ผู้ลงนาม)'],
    ['directorPosition', 'ตำแหน่งผู้ลงนาม'], ['directorPhone', 'โทรศัพท์ผู้อำนวยการ'], ['adminName', 'ผู้ดูแลระบบของโรงเรียน'],
    ['adminPosition', 'ตำแหน่งผู้ดูแลระบบ'], ['adminPhone', 'โทรศัพท์ผู้ดูแลระบบ'], ['adminEmail', 'อีเมลรับบัญชีผู้ใช้'],
    ['docNumber', 'เลขที่หนังสือ'], ['letterDate', 'ลงวันที่'], ['students', 'จำนวนนักเรียน'], ['teachers', 'จำนวนครูและบุคลากร'],
    ['purpose', 'งานที่จะใช้ระบบ'], ['letterUrl', 'หนังสือขอใช้ระบบ (PDF)'], ['databaseUrl', 'ฐานข้อมูลของโรงเรียน'],
    ['installedAt', 'วันที่ติดตั้ง'], ['credentialsSentAt', 'วันที่ส่งบัญชีผู้ใช้'], ['error', 'หมายเหตุ']
  ];

  function registryRow(code, record) {
    var item = Object.assign({}, record, {
      code: code, statusName: STATUS_NAMES[record.status] || record.status, systemUrl: record.status === 'active' ? systemUrl(code) : '',
      databaseUrl: record.databaseId ? 'https://docs.google.com/spreadsheets/d/' + record.databaseId + '/edit' : ''
    });
    return REGISTRY_COLUMNS.map(function (column) {
      var value = item[column[0]];
      if (value === undefined || value === null) return '';
      var text = String(value);
      // กันสูตร และเก็บตัวเลขที่ขึ้นต้นด้วย 0 (เบอร์โทร รหัสไปรษณีย์) ไว้เป็นข้อความ
      return /^[=+\-@]/.test(text) || /^0\d/.test(text) || /^\d{5,}$/.test(text) ? "'" + text : text;
    });
  }

  function registrySheet() {
    var spreadsheet = SpreadsheetApp.openById(REGISTRY_SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(REGISTRY_SHEET);
    var headers = REGISTRY_COLUMNS.map(function (column) { return column[1]; });
    if (!sheet) {
      sheet = spreadsheet.insertSheet(REGISTRY_SHEET, 0);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8f0fe');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    return sheet;
  }

  function writeRegistry(code, record) {
    try {
      var sheet = registrySheet();
      var values = registryRow(code, record);
      var codeColumn = 4;
      var match = sheet.getLastRow() > 1 ? sheet.getRange(2, codeColumn, sheet.getLastRow() - 1, 1)
        .createTextFinder(code).matchEntireCell(true).findNext() : null;
      if (match) sheet.getRange(match.getRow(), 1, 1, values.length).setValues([values]);
      else sheet.appendRow(values);
    } catch (error) {
      console.error(JSON.stringify({ action: 'distribution.registry', code: code, message: error.message }));
    }
  }

  // ---------- อีเมล ----------
  function sendCredentials(record, code, password, pdf, isReset) {
    var link = systemUrl(code);
    var appLink = link + '&app=1';
    var e = escapeHtml;
    var subject = (isReset ? 'รหัสผ่านใหม่: ' : 'พร้อมใช้งาน: ') + SYSTEM_NAME + ' ' + record.schoolName;
    var html = '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;max-width:640px">' +
      '<h2 style="color:#0f3d6e;margin:0 0 8px">' + e(SYSTEM_NAME) + '<br><small style="color:#475569">' + e(record.schoolName) + '</small></h2>' +
      '<p>เรียน ' + e(record.adminName) + '</p>' +
      '<p>' + (isReset ? 'ผู้ดูแลระบบกลางได้ตั้งรหัสผ่านใหม่ให้บัญชีผู้ดูแลระบบของโรงเรียนตามที่ร้องขอ'
        : 'ระบบของ' + e(record.schoolName) + ' ติดตั้งเสร็จเรียบร้อยและพร้อมใช้งานแล้ว (เลขคำขอ ' + e(record.requestNo) + ')') + '</p>' +
      '<table style="border-collapse:collapse;margin:12px 0;font-size:15px">' +
      row('ลิงก์เข้าระบบ', '<a href="' + e(link) + '">' + e(link) + '</a>') +
      row('ลิงก์แบบแอปมือถือ', '<a href="' + e(appLink) + '">เปิดบนมือถือ</a> (เพิ่มลงหน้าจอหลักได้)') +
      row('ชื่อผู้ใช้', '<b style="font-size:17px">admin</b>') +
      row('รหัสผ่านชั่วคราว', '<b style="font-size:17px;font-family:Consolas,monospace;letter-spacing:1px">' + e(password) + '</b>') +
      '</table>' +
      '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px">ระบบจะให้<b>เปลี่ยนรหัสผ่าน</b>ทันทีเมื่อเข้าใช้ครั้งแรก กรุณาเก็บรหัสผ่านเป็นความลับ และลบอีเมลนี้หลังเปลี่ยนรหัสผ่านแล้ว</p>' +
      (isReset ? '' : '<h3 style="color:#0f3d6e;margin:18px 0 6px">เริ่มต้นใช้งาน 5 ขั้นตอน</h3><ol style="padding-left:20px;margin:0">' +
        '<li>เข้าสู่ระบบด้วยบัญชีด้านบน แล้วตั้งรหัสผ่านใหม่</li>' +
        '<li>เมนู “หน้าแรกและข้อมูลโรงเรียน” ตรวจชื่อ ที่อยู่ ตราโรงเรียน และข้อมูลผู้บริหาร</li>' +
        '<li>เมนู “ปีการศึกษา” ตรวจปีการศึกษาและภาคเรียนปัจจุบัน (ระบบสร้างไว้ให้แล้ว)</li>' +
        '<li>เพิ่มบุคลากร นักเรียน และห้องเรียน (นำเข้าจาก Excel/Google Sheets ได้ที่ปุ่ม “นำเข้า CSV”)</li>' +
        '<li>เมนู “ผู้ใช้งาน” สร้างบัญชีให้ครูทุกคนในครั้งเดียว แล้วแจกรหัสผ่านให้ครูแต่ละคน</li></ol>' +
        '<p>ต้องการทดลองระบบก่อน กดปุ่ม “โหลดข้อมูลตัวอย่าง” ที่เมนู “ตั้งค่าระบบ” ได้ (ลบข้อมูลตัวอย่างได้ภายหลัง)</p>') +
      '<p style="color:#64748b;font-size:13px;margin-top:18px">ข้อมูลของโรงเรียนจัดเก็บในฐานข้อมูลแยกเฉพาะของโรงเรียน ผู้ใช้ของโรงเรียนอื่นเข้าถึงไม่ได้ ' +
      'อีเมลนี้ส่งอัตโนมัติจาก' + e(SYSTEM_NAME) + ' หากมีข้อสงสัยตอบกลับอีเมลนี้ได้</p>' +
      '<p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:8px">' + e(developerCredit().text) + '</p></div>';
    var plain = SYSTEM_NAME + ' - ' + record.schoolName + '\nลิงก์เข้าระบบ: ' + link + '\nลิงก์แบบแอป: ' + appLink +
      '\nชื่อผู้ใช้: admin\nรหัสผ่านชั่วคราว: ' + password + '\nระบบจะให้เปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก';
    var message = { to: record.adminEmail, subject: subject, htmlBody: html, body: plain, name: SYSTEM_NAME, replyTo: config().ownerEmail };
    if (pdf && !isReset) message.attachments = [pdf];
    MailApp.sendEmail(message);
  }

  function sendReceipt(record) {
    try {
      MailApp.sendEmail({ to: record.adminEmail, name: SYSTEM_NAME, replyTo: config().ownerEmail,
        subject: 'ได้รับคำขอใช้' + SYSTEM_NAME + ' ' + record.schoolName + ' แล้ว',
        htmlBody: '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.7">เรียน ' + escapeHtml(record.adminName) +
          '<p>ระบบได้รับหนังสือขอใช้' + SYSTEM_NAME + 'ของ' + escapeHtml(record.schoolName) + ' แล้ว (เลขคำขอ ' + escapeHtml(record.requestNo) + ')</p>' +
          '<p>เมื่อผู้ดูแลระบบกลางติดตั้งให้เรียบร้อย ระบบจะส่งลิงก์ ชื่อผู้ใช้ และรหัสผ่านมาที่อีเมลนี้</p></div>' });
    } catch (error) { console.error('receipt: ' + error.message); }
  }

  function notifyOwner(code, record, pdf) {
    try {
      var e = escapeHtml;
      var html = '<div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;line-height:1.6">' +
        '<h2 style="margin:0 0 6px;color:#0f3d6e">คำขอใช้ระบบใหม่: ' + e(record.schoolName) + '</h2>' +
        '<p>สถานะ: <b>' + e(STATUS_NAMES[record.status] || record.status) + '</b>' + (record.error ? ' — ' + e(record.error) : '') + '</p>' +
        '<table style="border-collapse:collapse;font-size:14px">' + FIELDS.map(function (field) {
          return record[field[0]] ? row(field[1], e(record[field[0]])) : '';
        }).join('') + row('เลขคำขอ', e(record.requestNo)) + row('รหัสระบบ', e(code)) +
        (record.status === 'active' ? row('ลิงก์ระบบของโรงเรียน', '<a href="' + e(systemUrl(code)) + '">' + e(systemUrl(code)) + '</a>') : '') +
        '</table><p><a href="' + e(registryUrl()) + '">เปิดชีตทะเบียนโรงเรียนที่ใช้ระบบ</a> · ' +
        '<a href="' + e(baseUrl()) + '#/distribution">จัดการในระบบ (เมนู โรงเรียนที่ขอใช้ระบบ)</a></p>' +
        '<p style="color:#64748b;font-size:13px">แนบ: หนังสือขอใช้ระบบที่ผู้อำนวยการลงนามแล้ว (PDF)</p></div>';
      var message = { to: config().ownerEmail, name: SYSTEM_NAME, subject: '[คำขอใช้ระบบ] ' + record.schoolName + ' จ.' + record.province +
        ' (' + (STATUS_NAMES[record.status] || record.status) + ')', htmlBody: html };
      if (pdf) message.attachments = [pdf];
      MailApp.sendEmail(message);
    } catch (error) { console.error('notifyOwner: ' + error.message); }
  }

  function row(label, value) {
    return '<tr><td style="padding:4px 14px 4px 0;color:#475569;vertical-align:top;white-space:nowrap">' + escapeHtml(label) + '</td><td style="padding:4px 0">' + value + '</td></tr>';
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function maskEmail(email) {
    var parts = String(email || '').split('@');
    if (parts.length !== 2) return '';
    var name = parts[0];
    return (name.length <= 2 ? name.charAt(0) + '*' : name.slice(0, 2) + new Array(Math.min(6, name.length - 1)).join('*')) + '@' + parts[1];
  }

  function fullAddress(record) {
    return [record.address, record.subdistrict ? 'ตำบล' + record.subdistrict.replace(/^(ตำบล|ต\.|แขวง)\s*/, '') : '',
      record.district ? 'อำเภอ' + record.district.replace(/^(อำเภอ|อ\.|เขต)\s*/, '') : '',
      record.province ? 'จังหวัด' + record.province.replace(/^(จังหวัด|จ\.)\s*/, '') : '', record.postcode].filter(Boolean).join(' ');
  }

  // ---------- สำหรับผู้ดูแลระบบกลาง ----------
  function list(token) {
    requireOwner(token);
    var settings = config();
    var items = Tenant.allRecords().map(function (item) {
      return {
        code: item.code, requestNo: item.requestNo, status: item.status, statusName: STATUS_NAMES[item.status] || item.status,
        schoolName: item.schoolName, province: item.province, affiliation: item.affiliation, directorName: item.directorName,
        adminName: item.adminName, adminEmail: item.adminEmail, adminPhone: item.adminPhone, createdAt: item.createdAt,
        installedAt: item.installedAt || '', error: item.error || '', letterUrl: item.letterUrl || '',
        systemUrl: item.status === 'active' || item.status === 'suspended' ? systemUrl(item.code) : '',
        databaseUrl: item.databaseId ? 'https://docs.google.com/spreadsheets/d/' + item.databaseId + '/edit' : ''
      };
    }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return { items: items, config: settings, defaultAddressee: defaultAddressee(), registerUrl: registerUrl(), registryUrl: registryUrl(), mainUrl: MAIN_URL };
  }

  function saveConfig(token, data) {
    requireOwner(token);
    data = data || {};
    var errors = {};
    var next = {
      ownerEmail: String(data.ownerEmail || '').trim().toLowerCase(),
      addressee: String(data.addressee || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      autoApprove: data.autoApprove === true || data.autoApprove === 'true',
      dailyLimit: Math.floor(Number(data.dailyLimit)),
      baseUrl: String(data.baseUrl || '').trim()
    };
    if (!EMAIL.test(next.ownerEmail)) errors.ownerEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!next.addressee) errors.addressee = 'กรุณาระบุคำขึ้นต้น (เรียน ...)';
    if (!(next.dailyLimit >= 1 && next.dailyLimit <= 200)) errors.dailyLimit = 'ระบุ 1–200';
    if (next.baseUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(next.baseUrl)) errors.baseUrl = 'ต้องเป็นลิงก์ระบบที่ลงท้ายด้วย /exec';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    Tenant.rawProps().setProperty(CONFIG_PROPERTY, JSON.stringify(next));
    return config();
  }

  function installNow(token, data) {
    var context = requireOwner(token);
    var code = String((data && data.code) || '');
    var record = Tenant.record(code);
    if (!record) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบคำขอ');
    if (['pending', 'failed', 'rejected'].indexOf(record.status) === -1) throw SheetRepository.serviceError('CONFLICT', 'คำขอนี้ติดตั้งแล้วหรือกำลังติดตั้ง');
    var result = install(code, null);
    AuditService.write('SCHOOL_INSTALL', 'Distribution', code, { ok: result.ok }, context.user.id);
    if (!result.ok) throw SheetRepository.serviceError('INSTALL_FAILED', 'ติดตั้งไม่สำเร็จ: ' + result.error);
    return { ok: true };
  }

  function setStatus(token, data) {
    var context = requireOwner(token);
    var code = String((data && data.code) || '');
    var status = String((data && data.status) || '');
    var record = Tenant.record(code);
    if (!record) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบคำขอ');
    var allowed = { active: ['suspended'], suspended: ['active'], pending: ['rejected'], failed: ['rejected'], rejected: ['pending'] };
    if ((allowed[record.status] || []).indexOf(status) === -1) throw SheetRepository.serviceError('CONFLICT', 'เปลี่ยนสถานะนี้ไม่ได้');
    record = Tenant.saveRecord(code, Object.assign({}, record, { status: status }));
    writeRegistry(code, record);
    AuditService.write('SCHOOL_STATUS', 'Distribution', code, { status: status }, context.user.id);
    return { status: status, statusName: STATUS_NAMES[status] };
  }

  // ตั้งรหัสผ่านใหม่ให้ผู้ดูแลระบบของโรงเรียน แล้วส่งทางอีเมลที่ลงทะเบียนไว้ (เจ้าของระบบไม่เห็นรหัสผ่าน)
  function resetPassword(token, data) {
    var context = requireOwner(token);
    var code = String((data && data.code) || '');
    var record = Tenant.record(code);
    if (!record || record.status !== 'active') throw SheetRepository.serviceError('CONFLICT', 'ทำได้เฉพาะโรงเรียนที่ใช้งานอยู่');
    var password = randomPassword();
    try {
      Tenant.use(code);
      var username = Core.normalizeUsername(Tenant.props().getProperty('INITIAL_ADMIN_USERNAME') || 'admin');
      var admin = SheetRepository.all('Users').filter(function (user) { return user.username === username; })[0];
      if (!admin) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบบัญชีผู้ดูแลระบบของโรงเรียนนี้');
      var salt = AuthService.createSalt();
      SheetRepository.update('Users', admin.id, { passwordHash: AuthService.hashPassword(password, salt), passwordSalt: salt,
        isActive: true, mustChangePassword: true }, admin.version, 'system');
      AuditService.write('ADMIN_PASSWORD_RESET_BY_OWNER', 'Users', admin.id, {}, 'system');
    } finally {
      Tenant.use('');
    }
    sendCredentials(record, code, password, null, true);
    AuditService.write('SCHOOL_PASSWORD_RESET', 'Distribution', code, {}, context.user.id);
    return { email: maskEmail(record.adminEmail) };
  }

  return { registerPage: registerPage, assets: assets, submit: submit, list: list, saveConfig: saveConfig, installNow: installNow,
    setStatus: setStatus, resetPassword: resetPassword, systemUrl: systemUrl,
    checkRegistry: function () { return registrySheet().getName(); }, registerUrl: registerUrl, config: config };
})();

/**
 * รันครั้งเดียวจากหน้าแก้ไข Apps Script (เลือกฟังก์ชันนี้แล้วกด Run) เพื่ออนุญาตสิทธิ์ส่งอีเมลและเขียนชีตทะเบียนกลาง
 * ส่งอีเมลทดสอบถึงเจ้าของระบบ 1 ฉบับ
 */
function authorizeDistribution() {
  var settings = DistributionService.config();
  DistributionService.checkRegistry();
  MailApp.sendEmail(settings.ownerEmail, 'ทดสอบการส่งอีเมลของระบบขอใช้ระบบ', 'อนุญาตสิทธิ์เรียบร้อย ระบบส่งอีเมลได้แล้ว\nลิงก์หน้าขอใช้ระบบ: ' + DistributionService.registerUrl());
  Logger.log('อนุญาตสิทธิ์เรียบร้อย ลิงก์หน้าขอใช้ระบบ: ' + DistributionService.registerUrl());
}
