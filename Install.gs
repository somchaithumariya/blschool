/**
 * ติดตั้งระบบครั้งแรกด้วยการกด Run ฟังก์ชันเดียว
 * 1. เปลี่ยน INSTALL_SPREADSHEET_ID ให้เป็น ID ของ Google Sheet ฐานข้อมูลของโรงเรียน
 * 2. เลือกฟังก์ชัน installSystem แล้วกด Run และอนุญาตสิทธิ์
 * 3. เข้าสู่ระบบด้วย ADMIN_USERNAME และ ADMIN_PASSWORD ด้านล่าง
 * เรียกซ้ำได้โดยไม่ลบหรือสร้างข้อมูลซ้ำ
 *
 * ต้องการเปลี่ยนรหัสผ่านผู้ดูแลระบบ: แก้ ADMIN_PASSWORD แล้ว Run ฟังก์ชัน setAdminPassword
 * หรือเปลี่ยนจากหน้าเว็บ เมนู "ข้อมูลโรงเรียน" > "เปลี่ยนรหัสผ่าน"
 */
var INSTALL_SPREADSHEET_ID = '1n6V-zQcuJntZLGhILqzI9bhDzr9q-9jcxky2hrVOV5Y';
var INSTALL_ROOT_FOLDER_NAME = 'ระบบบริหารจัดการโรงเรียน - ไฟล์';
var ADMIN_USERNAME = 'admin';
var ADMIN_PASSWORD = '1234';

// options.adminPassword = รหัสผ่านสุ่มของโรงเรียนใหม่ (ติดตั้งจากระบบขอใช้) ผู้ดูแลต้องเปลี่ยนรหัสเมื่อเข้าใช้ครั้งแรก
function installSystem(options) {
  options = options || {};
  var properties = Tenant.props();
  if (!properties.getProperty('DATABASE_SPREADSHEET_ID')) {
    if (!Tenant.isMain()) throw new Error('ยังไม่ได้สร้างฐานข้อมูลของโรงเรียนนี้');
    SpreadsheetApp.openById(INSTALL_SPREADSHEET_ID);
    properties.setProperty('DATABASE_SPREADSHEET_ID', INSTALL_SPREADSHEET_ID);
  }
  if (!properties.getProperty('FILES_FOLDER_ID')) {
    var file = DriveApp.getFileById(properties.getProperty('DATABASE_SPREADSHEET_ID'));
    var parents = file.getParents();
    var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    properties.setProperty('FILES_FOLDER_ID', parent.createFolder(INSTALL_ROOT_FOLDER_NAME).getId());
  }
  if (!properties.getProperty('INITIAL_ADMIN_USERNAME')) {
    properties.setProperty('INITIAL_ADMIN_USERNAME', ADMIN_USERNAME);
  }

  var username = Core.normalizeUsername(properties.getProperty('INITIAL_ADMIN_USERNAME'));
  setupSystem();
  // เพิ่ม pepper เฉพาะตอนยังไม่มีผู้ใช้ เพื่อไม่ให้ hash รหัสผ่านเดิมใช้ไม่ได้
  if (!properties.getProperty('PASSWORD_PEPPER') && SheetRepository.all('Users', { includeDeleted: true }).length === 0) {
    properties.setProperty('PASSWORD_PEPPER', Utilities.getUuid() + Utilities.getUuid());
  }
  var adminExists = SheetRepository.find('Users', function (user) { return user.username === username; }).length > 0;
  if (!adminExists) properties.setProperty('INITIAL_ADMIN_PASSWORD', options.adminPassword || ADMIN_PASSWORD);
  var result = seedSystem();
  properties.deleteProperty('INITIAL_ADMIN_PASSWORD');
  // รหัสสุ่ม: บัญชีที่เพิ่งสร้างถูกบังคับเปลี่ยนรหัสผ่านอยู่แล้ว ไม่ต้องตั้งเป็นค่า ADMIN_PASSWORD
  if (!adminExists && !options.adminPassword) setAdminPassword();
  properties.setProperty('SYSTEM_INSTALLED', new Date().toISOString());

  Logger.log('ติดตั้งเสร็จแล้ว');
  Logger.log('ฐานข้อมูล: https://docs.google.com/spreadsheets/d/' + properties.getProperty('DATABASE_SPREADSHEET_ID'));
  Logger.log('โฟลเดอร์ไฟล์: https://drive.google.com/drive/folders/' + properties.getProperty('FILES_FOLDER_ID'));
  Logger.log('ชื่อผู้ใช้ผู้ดูแลระบบ: ' + result.adminUsername);
  Logger.log(adminExists ? 'บัญชีผู้ดูแลมีอยู่แล้ว ไม่ได้เปลี่ยนรหัสผ่าน (ใช้ setAdminPassword หากต้องการตั้งใหม่)'
    : 'รหัสผ่าน: ตามค่า ADMIN_PASSWORD ในไฟล์นี้');
  return { ok: true, adminUsername: result.adminUsername };
}

/**
 * ตั้งรหัสผ่านผู้ดูแลระบบเป็นค่า ADMIN_PASSWORD ด้านบน (ใช้เมื่อลืมรหัสผ่านหรือต้องการเปลี่ยน)
 */
function setAdminPassword() {
  var username = Core.normalizeUsername(Tenant.props().getProperty('INITIAL_ADMIN_USERNAME') || ADMIN_USERNAME);
  var admin = SheetRepository.find('Users', function (user) { return user.username === username; })[0];
  if (!admin) throw new Error('ไม่พบบัญชี ' + username + ' กรุณารัน installSystem ก่อน');
  var salt = AuthService.createSalt();
  SheetRepository.update('Users', admin.id, {
    passwordHash: AuthService.hashPassword(String(ADMIN_PASSWORD), salt),
    passwordSalt: salt,
    isActive: true,
    mustChangePassword: false
  }, admin.version, 'system');
  AuditService.write('ADMIN_PASSWORD_SET', 'Users', admin.id, {}, 'system');
  Logger.log('ตั้งรหัสผ่านของ ' + username + ' ตามค่า ADMIN_PASSWORD แล้ว');
  return { ok: true, adminUsername: username };
}
