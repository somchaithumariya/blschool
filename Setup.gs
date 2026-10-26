function setupSystem() {
  ConfigService.getFilesFolder();
  var result = SheetRepository.withLock(function () {
    Object.keys(APP_CONFIG.SHEETS).forEach(function (sheetName) {
      SheetRepository.ensureSheet(sheetName);
    });
    return { ok: true, sheetCount: Object.keys(APP_CONFIG.SHEETS).length };
  });
  result.folders = FolderService.ensureFolders();
  return result;
}

function seedSystem(options) {
  setupSystem();
  var properties = Tenant.props();
  var adminUsername = properties.getProperty('INITIAL_ADMIN_USERNAME');
  var adminPassword = properties.getProperty('INITIAL_ADMIN_PASSWORD');
  if (!adminUsername) {
    throw SheetRepository.serviceError('CONFIG_MISSING', 'กรุณากำหนด INITIAL_ADMIN_USERNAME');
  }
  var normalizedUsername = Core.normalizeUsername(adminUsername);
  var admin = SheetRepository.find('Users', function (user) { return user.username === normalizedUsername; })[0];
  if (!admin && !adminPassword) {
    throw SheetRepository.serviceError('CONFIG_MISSING', 'กรุณากำหนด INITIAL_ADMIN_PASSWORD สำหรับการสร้างบัญชีครั้งแรก');
  }

  return SheetRepository.runBatch(function () {
    return seedRecords(normalizedUsername, admin, adminPassword, options || {});
  });
}

function seedRecords(normalizedUsername, admin, adminPassword, options) {
  var systemActor = 'system';
  var existingPermissionKeys = SheetRepository.all('Permissions').map(function (row) { return row.key; });
  var existingRoleKeys = SheetRepository.all('Roles').map(function (row) { return row.key; });
  var permissions = APP_CONFIG.PERMISSIONS.map(function (key) {
    return findOrInsert('Permissions', 'key', key, { key: key, name: key }, systemActor);
  });
  var roles = APP_CONFIG.ROLE_SEEDS.map(function (role) {
    return findOrInsert('Roles', 'key', role.key, role, systemActor);
  });
  var adminRole = roles.filter(function (role) { return role.key === 'admin'; })[0];
  permissions.forEach(function (permission) {
    findPairOrInsert('RolePermissions', 'roleId', adminRole.id, 'permissionId', permission.id, systemActor);
  });

  var teacherRole = roles.filter(function (role) { return role.key === 'teacher'; })[0];
  var executiveRole = roles.filter(function (role) { return role.key === 'executive'; })[0];
  MasterDataService.seedDefaults(systemActor);

  // บทบาทใหม่ได้สิทธิ์เริ่มต้นทั้งหมด บทบาทเดิมได้เฉพาะสิทธิ์ที่เพิ่งเพิ่มเข้าระบบ
  // (ไม่คืนสิทธิ์ที่ผู้ดูแลระบบเคยถอดออกไปแล้ว)
  [teacherRole, executiveRole].forEach(function (role) {
    var defaults = APP_CONFIG.ROLE_PERMISSION_SEEDS[role.key] || [];
    var isNewRole = existingRoleKeys.indexOf(role.key) === -1;
    seedRolePermissions(role, permissions, defaults.filter(function (key) {
      return isNewRole || options.fullRoleDefaults === true || existingPermissionKeys.indexOf(key) === -1;
    }));
  });
  seedDefaultPeriods(systemActor);
  // เกณฑ์นิเทศและหัวข้อประเมิน ว.23 ตั้งต้น (DefaultsData.gs)
  if (typeof seedModuleDefaults === 'function') seedModuleDefaults(systemActor);

  APP_CONFIG.MODULES.forEach(function (module) {
    findOrInsert('Modules', 'key', module.key, Object.assign({}, module, { isEnabled: true }), systemActor);
  });

  Object.keys(APP_CONFIG.DEFAULT_SETTINGS).forEach(function (key) {
    findOrInsert('Settings', 'key', key, { key: key, valueJson: JSON.stringify(APP_CONFIG.DEFAULT_SETTINGS[key]) }, systemActor);
  });

  if (!admin) {
    var salt = AuthService.createSalt();
    admin = SheetRepository.insert('Users', {
      username: normalizedUsername,
      displayName: 'ผู้ดูแลระบบ',
      email: '',
      passwordHash: AuthService.hashPassword(adminPassword, salt),
      passwordSalt: salt,
      isActive: true,
      mustChangePassword: true
    }, systemActor);
  }
  findPairOrInsert('UserRoles', 'userId', admin.id, 'roleId', adminRole.id, systemActor);
  var seedAuditExists = SheetRepository.find('AuditLogs', function (row) {
    return row.action === 'SYSTEM_SEEDED';
  }).length > 0;
  if (!seedAuditExists) AuditService.write('SYSTEM_SEEDED', 'System', 'initial', {}, systemActor);
  return { ok: true, adminUsername: normalizedUsername };
}

function findOrInsert(sheetName, fieldName, value, values, actorId) {
  return SheetRepository.find(sheetName, function (row) { return String(row[fieldName]) === String(value); })[0] ||
    SheetRepository.insert(sheetName, values, actorId);
}

function findPairOrInsert(sheetName, leftField, leftValue, rightField, rightValue, actorId) {
  var existing = SheetRepository.find(sheetName, function (row) {
    return String(row[leftField]) === String(leftValue) && String(row[rightField]) === String(rightValue);
  })[0];
  var values = {};
  values[leftField] = leftValue;
  values[rightField] = rightValue;
  return existing || SheetRepository.insert(sheetName, values, actorId);
}

function seedRolePermissions(role, permissions, keys) {
  permissions.filter(function (permission) { return keys.indexOf(permission.key) !== -1; })
    .forEach(function (permission) {
      findPairOrInsert('RolePermissions', 'roleId', role.id, 'permissionId', permission.id, 'system');
    });
}

function seedDefaultPeriods(actorId) {
  if (SheetRepository.all('Periods', { includeDeleted: true }).length > 0) return;
  var times = [['08:30', '09:20'], ['09:20', '10:10'], ['10:10', '11:00'], ['11:00', '11:50'],
    ['12:50', '13:40'], ['13:40', '14:30'], ['14:30', '15:20'], ['15:20', '16:10']];
  times.forEach(function (time, index) {
    SheetRepository.insert('Periods', { periodNo: index + 1, label: 'คาบที่ ' + (index + 1), startTime: time[0], endTime: time[1] }, actorId);
  });
}

// เติมข้อความตัวอย่างของหน้าแรกให้ช่องที่ยังว่าง (ไม่ทับข้อมูลที่โรงเรียนกรอกไว้แล้ว)
function fillSampleLandingContent() {
  var samples = APP_CONFIG.SAMPLE_LANDING_CONTENT;
  SheetRepository.all('Settings').forEach(function (row) {
    if (!Object.prototype.hasOwnProperty.call(samples, row.key)) return;
    var value;
    try { value = JSON.parse(row.valueJson); } catch (error) { value = row.valueJson; }
    if (String(value || '').trim()) return;
    SheetRepository.update('Settings', row.id, { valueJson: JSON.stringify(samples[row.key]) }, row.version, 'system');
  });
}

// สร้างข้อมูลตัวอย่างจาก Apps Script Editor / clasp run (เรียกซ้ำจนกว่าจะเสร็จ)
function runDemoSeed() {
  DemoService.scheduleIfEmpty();
  return DemoService.step();
}

// ชื่อห้องที่ซ้ำระดับชั้น (เช่น ระดับชั้น ป.1 ชื่อห้อง "ป.1/1" ทำให้แสดงเป็น ป.1/ป.1/1) ให้เหลือเฉพาะเลขห้อง
// ข้ามห้องที่ถ้าแก้แล้วจะซ้ำกับห้องที่มีอยู่ (ปีการศึกษา + ระดับชั้น + ชื่อห้องเดียวกัน)
function normalizeRoomNames() {
  var rooms = SheetRepository.all('Homerooms');
  var taken = rooms.reduce(function (set, room) { set[room.academicYearId + '|' + room.gradeLevel + '|' + room.roomName] = true; return set; }, {});
  var fixed = 0;
  rooms.forEach(function (room) {
    var prefix = String(room.gradeLevel || '') + '/';
    var name = String(room.roomName || '');
    if (!room.gradeLevel || name.indexOf(prefix) !== 0 || name.length <= prefix.length) return;
    var short = name.slice(prefix.length);
    var key = room.academicYearId + '|' + room.gradeLevel + '|' + short;
    if (taken[key]) return;
    SheetRepository.update('Homerooms', room.id, { roomName: short }, room.version, 'system');
    taken[key] = true;
    fixed += 1;
  });
  return fixed;
}
