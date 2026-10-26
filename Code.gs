function doGet(e) {
  var params = (e && e.parameter) || {};
  if (!developerCreditIntact()) {
    return HtmlService.createHtmlOutput('<div style="font-family:Sarabun,Tahoma,sans-serif;padding:32px"><h2>ระบบหยุดทำงาน</h2>' +
      '<p>ข้อมูลผู้คิดค้นและพัฒนาระบบถูกแก้ไขหรือลบ กรุณาติดต่อผู้พัฒนาระบบ</p></div>').setTitle('ระบบบริหารจัดการโรงเรียน');
  }
  // หน้าขอใช้ระบบสำหรับโรงเรียนอื่น (กรอกข้อมูล + ลงนามหนังสือ)
  if (params.page === 'register') return DistributionService.registerPage();
  try {
    Tenant.use(params.s);
  } catch (error) {
    return HtmlService.createHtmlOutput('<div style="font-family:Sarabun,Tahoma,sans-serif;padding:32px">' +
      '<h2>เปิดระบบไม่ได้</h2><p>' + escapeForHtml(error.message) + '</p></div>').setTitle('ระบบบริหารจัดการโรงเรียน');
  }
  try {
    ensureInstalled();
  } catch (error) {
    return HtmlService.createHtmlOutput('<div style="font-family:Sarabun,Tahoma,sans-serif;padding:32px">' +
      '<h2>ติดตั้งระบบไม่สำเร็จ</h2><p>' + escapeForHtml(error.message) + '</p></div>')
      .setTitle('ระบบบริหารจัดการโรงเรียน');
  }
  // หน้าห้องรับฟังสำหรับนักเรียน (?page=concern[&s=รหัสโรงเรียน]) เป็นหน้าเล็กแยก ไม่โหลดโค้ดของระบบหลัก
  if (params.page === 'concern') {
    try { return ConcernService.page(); } catch (error) {
      return HtmlService.createHtmlOutput('<div style="font-family:Sarabun,Tahoma,sans-serif;padding:32px"><h2>เปิดหน้านี้ไม่ได้</h2><p>' +
        escapeForHtml(error.message) + '</p></div>').setTitle('ห้องรับฟัง');
    }
  }
  // แบบสอบถาม SWOT สำหรับผู้มีส่วนเกี่ยวข้อง (?page=swot[&s=รหัสโรงเรียน]) ไม่ต้องเข้าสู่ระบบ
  if (params.page === 'swot') {
    try { return SwotService.page(); } catch (error) {
      return HtmlService.createHtmlOutput('<div style="font-family:Sarabun,Tahoma,sans-serif;padding:32px"><h2>เปิดหน้านี้ไม่ได้</h2><p>' +
        escapeForHtml(error.message) + '</p></div>').setTitle('แบบสอบถาม');
    }
  }
  // ?app=1 = โหมดแอปมือถือ: ข้ามหน้าประชาสัมพันธ์ ไปหน้าเข้าสู่ระบบทันที
  var appMode = params.app === '1' || params.app === 'true';
  var template = HtmlService.createTemplateFromFile('Index');
  // ลิงก์จากการแจ้งเตือน: ?open=leave&id=<รหัสใบลา> เปิดใบลาเพื่อพิจารณาหลังเข้าสู่ระบบ
  // ?open=review&id=<รหัสการส่ง> เปิดรายงานที่ครูส่งถึงผู้บริหาร
  var openId = /^[\w-]{1,80}$/.test(String(params.id || '')) ? String(params.id) : '';
  var open = !openId ? null : params.open === 'leave' ? { entity: 'leave-requests', id: openId }
    : params.open === 'review' ? { entity: 'report-reviews', id: openId } : null;
  template.boot = bootJson({ appMode: appMode, open: open });
  var output = template.evaluate()
    .setTitle('ระบบบริหารจัดการโรงเรียน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  // เพิ่มลงหน้าจอหลักของโทรศัพท์แล้วเปิดแบบเต็มจอเหมือนแอป (บางเบราว์เซอร์ไม่รองรับ ไม่เป็นไร)
  ['apple-mobile-web-app-capable', 'mobile-web-app-capable'].forEach(function (name) {
    try { output.addMetaTag(name, 'yes'); } catch (error) { /* ไม่รองรับ */ }
  });
  return output;
}

// ติดตั้งอัตโนมัติเมื่อเปิดเว็บครั้งแรก ใช้ UserLock แยกจาก ScriptLock ที่ setupSystem ใช้อยู่
// และอัปเดตโครงสร้างตารางอัตโนมัติเมื่อ APP_CONFIG.SCHEMA_VERSION เปลี่ยน
function ensureInstalled() {
  var properties = Tenant.props();
  var targetVersion = String(APP_CONFIG.SCHEMA_VERSION);
  if (properties.getProperty('SYSTEM_INSTALLED') && properties.getProperty('SCHEMA_VERSION') === targetVersion) return;
  var lock = LockService.getUserLock();
  lock.waitLock(300000);
  try {
    if (!properties.getProperty('SYSTEM_INSTALLED')) {
      installSystem();
    } else if (properties.getProperty('SCHEMA_VERSION') !== targetVersion) {
      // รุ่นแรก (ไม่มี SCHEMA_VERSION) ยังไม่มีสิทธิ์เริ่มต้นของครู/ผู้บริหารสำหรับเมนูใหม่ จึงเติมให้ครบหนึ่งครั้ง
      var previous = Number(properties.getProperty('SCHEMA_VERSION') || 1);
      SheetRepository.clearAllCaches();
      seedSystem({ fullRoleDefaults: previous < 2 });
      if (previous < 6) fillSampleLandingContent();
      if (previous < 8) normalizeRoomNames();
      if (previous < 14) SupervisionService.migrateLegacy();
      SheetRepository.clearAllCaches();
    }
    properties.setProperty('SCHEMA_VERSION', targetVersion);
    try { DemoService.scheduleIfEmpty(); } catch (error) { console.error(error.message); }
  } finally {
    lock.releaseLock();
  }
}

// ส่งข้อมูลโรงเรียนไปพร้อมหน้าเว็บ เพื่อไม่ต้องเรียกเซิร์ฟเวอร์ซ้ำตอนเปิดหน้า
function bootJson(options) {
  var boot = { settings: null, landing: null, demoPending: false, appMode: !!(options && options.appMode),
    tenant: Tenant.code(), baseUrl: DistributionService.systemUrl(Tenant.code()), registerUrl: DistributionService.registerUrl(),
    credit: developerCredit(), open: (options && options.open) || null };
  try { DemoService.scheduleIfEmpty(); boot.demoPending = DemoService.isPending(); } catch (error) { boot.demoPending = false; }
  try { boot.settings = SettingsService.getPublicSettings(); } catch (error) { boot.settings = null; }
  // โหมดแอปไม่แสดงหน้าประชาสัมพันธ์ จึงไม่ต้องเตรียมข้อมูลหน้าแรก (เปิดเร็วขึ้น)
  if (!boot.appMode) { try { boot.landing = LandingService.get(); } catch (error) { boot.landing = null; } }
  return JSON.stringify(boot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function escapeForHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

var INCLUDE_MEMO = {};

function include(filename) {
  if (INCLUDABLE_FILES.indexOf(filename) === -1) throw new Error('ไม่อนุญาตให้เรียกไฟล์นี้');
  if (!INCLUDE_MEMO[filename]) INCLUDE_MEMO[filename] = buildInclude(filename);
  return INCLUDE_MEMO[filename];
}

function buildInclude(filename) {
  // อ่านไฟล์แบบดิบ (ไม่ผ่านการประมวลผล HTML ของ Google)
  var raw = HtmlService.createTemplateFromFile(filename).getRawContent();
  // Styles และตัวกันคัดลอก (ScriptsGuard) ใส่ลงหน้าตรง ๆ เพราะหน้าเล็กที่แยกจากระบบหลักไม่มีตัวโหลดโมดูล
  if (filename === 'Styles' || filename === 'ScriptsGuard') return raw;
  // โค้ด JavaScript ส่งเป็นสตริง JSON ที่ไม่มีอักขระ < > & เพื่อไม่ให้ตัวประมวลผล HTML แตะต้องได้
  // แล้วให้ตัวโหลดใน Index.html ตรวจ syntax และรันทีละโมดูล (ถ้าพังจะแจ้งชื่อไฟล์บนหน้าจอ)
  var code = raw.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
  return '<script>window.__loadModule(' + safeScriptJson(filename) + ',' + safeScriptJson(code) + ');</script>';
}

function safeScriptJson(value) {
  return JSON.stringify(String(value)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// ไฟล์หน้าเว็บที่ Index.html ดึงมารวม (แยกตามหน้าที่เพื่อให้ดูแลง่าย)
var INCLUDABLE_FILES = ['Styles', 'ScriptsGuard', 'Scripts', 'ScriptsSite', 'ScriptsDesigner', 'ScriptsEntity', 'ScriptsPages', 'ScriptsAttendance', 'ScriptsAcademic',
  'ScriptsReports', 'ScriptsAdmin', 'ScriptsAi', 'ScriptsCare', 'ScriptsSafety', 'ScriptsSupervision', 'ScriptsSwot', 'ScriptsCheckin', 'ScriptsConsole', 'ScriptsMobile', 'ScriptsDistribution', 'ScriptsBot', 'ScriptsTeaching', 'ScriptsConcern', 'ScriptsReview', 'ScriptsStrategy'];
