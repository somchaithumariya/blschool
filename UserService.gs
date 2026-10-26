/**
 * ผู้ใช้งาน บทบาทและสิทธิ์ และโปรไฟล์ของฉัน
 */
var UserService = (function () {
  'use strict';

  var USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

  function publicUserRow(user, roleKeysByUser) {
    return { id: user.id, version: user.version, username: user.username, displayName: user.displayName, email: user.email,
      personnelId: user.personnelId || '', isActive: user.isActive !== false, mustChangePassword: user.mustChangePassword === true,
      phone: user.phone || '', registrationStatus: user.registrationStatus || '', createdAt: user.createdAt,
      roles: roleKeysByUser[user.id] || [] };
  }

  function roleKeysByUser() {
    var roles = EntityService.indexBy(SheetRepository.all('Roles'));
    return SheetRepository.all('UserRoles').reduce(function (index, row) {
      if (roles[row.roleId]) (index[row.userId] = index[row.userId] || []).push(roles[row.roleId].key);
      return index;
    }, {});
  }

  function listUsers(token) {
    AuthService.requirePermission(token, 'user.view');
    var roleIndex = roleKeysByUser();
    return {
      users: SheetRepository.all('Users').map(function (user) { return publicUserRow(user, roleIndex); })
        .sort(function (a, b) { return a.username.localeCompare(b.username); }),
      roles: SheetRepository.all('Roles').map(function (role) { return { id: role.id, key: role.key, name: role.name }; })
    };
  }

  function validatePassword(password, field) {
    var min = APP_CONFIG.PASSWORD_MIN_LENGTH || 6;
    if (String(password || '').length < min) {
      var errors = {};
      errors[field] = 'รหัสผ่านต้องมีอย่างน้อย ' + min + ' ตัวอักษร';
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    }
  }

  function saveUser(token, data) {
    var payload = data || {};
    var context = AuthService.requirePermission(token, payload.id ? 'user.edit' : 'user.add');
    var values = payload.values || {};
    var errors = {};
    var username = Core.normalizeUsername(values.username);
    if (!USERNAME_PATTERN.test(username)) errors.username = 'ใช้ a-z 0-9 . _ - ความยาว 3-40 ตัว';
    var displayName = String(values.displayName || '').trim().slice(0, 150);
    if (!displayName) errors.displayName = 'กรุณากรอกชื่อที่แสดง';
    var users = SheetRepository.all('Users');
    if (users.some(function (user) { return user.username === username && String(user.id) !== String(payload.id); })) {
      errors.username = 'ชื่อผู้ใช้นี้มีอยู่แล้ว';
    }
    if (values.personnelId && !SheetRepository.findById('Personnel', values.personnelId)) errors.personnelId = 'ไม่พบบุคลากร';
    var allRoles = SheetRepository.all('Roles');
    var roleIds = allRoles.filter(function (role) { return (values.roles || []).indexOf(role.key) !== -1; })
      .map(function (role) { return role.id; });
    if (!roleIds.length) errors.roles = 'กรุณาเลือกบทบาทอย่างน้อย 1 บทบาท';
    if (!payload.id && String(values.password || '').length < (APP_CONFIG.PASSWORD_MIN_LENGTH || 6)) {
      errors.password = 'รหัสผ่านต้องมีอย่างน้อย ' + (APP_CONFIG.PASSWORD_MIN_LENGTH || 6) + ' ตัวอักษร';
    }
    if (String(payload.id) === String(context.user.id) && values.isActive === false) errors.isActive = 'ไม่สามารถปิดบัญชีของตนเองได้';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);

    var fields = { username: username, displayName: displayName, email: String(values.email || '').trim().slice(0, 150),
      personnelId: values.personnelId || '', isActive: values.isActive !== false };
    var user;
    if (payload.id) {
      user = SheetRepository.update('Users', payload.id, fields, payload.version, context.user.id);
    } else {
      var salt = AuthService.createSalt();
      user = SheetRepository.insert('Users', Object.assign(fields, { passwordSalt: salt,
        passwordHash: AuthService.hashPassword(values.password, salt), mustChangePassword: true }), context.user.id);
    }
    // แทนที่บทบาทของผู้ใช้คนนี้ในครั้งเดียว (อ่านชีตจริงภายใต้ล็อก จึงไม่ชนกับแคชที่ค้าง)
    SheetRepository.replaceRows('UserRoles', function (row) { return String(row.userId) === String(user.id); },
      roleIds.map(function (roleId) { return Core.createRecord({ userId: user.id, roleId: roleId }, context.user.id); }));
    AuditService.write(payload.id ? 'USER_UPDATE' : 'USER_CREATE', 'Users', user.id, {}, context.user.id);
    return { id: user.id };
  }

  // สมัครสมาชิกด้วยตนเอง (ไม่ต้องเข้าสู่ระบบ) บัญชีจะรอผู้ดูแลระบบอนุมัติก่อนใช้งาน
  function register(data) {
    if (SettingsService.getPublicSettings().allowSelfRegistration !== true) {
      throw SheetRepository.serviceError('REGISTRATION_CLOSED', 'ระบบปิดรับสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ');
    }
    reserveRegistrationSlot();
    var values = data || {};
    var errors = {};
    var username = Core.normalizeUsername(values.username);
    if (!USERNAME_PATTERN.test(username)) errors.username = 'ใช้ a-z 0-9 . _ - ความยาว 3-40 ตัว';
    var displayName = String(values.displayName || '').trim().slice(0, 150);
    if (!displayName) errors.displayName = 'กรุณากรอกชื่อ-นามสกุล';
    var phone = String(values.phone || '').trim();
    if (phone && !/^[0-9+\- ]{9,15}$/.test(phone)) errors.phone = 'รูปแบบเบอร์โทรไม่ถูกต้อง';
    var email = String(values.email || '').trim().slice(0, 150);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    var min = APP_CONFIG.PASSWORD_MIN_LENGTH || 6;
    if (String(values.password || '').length < min) errors.password = 'รหัสผ่านต้องมีอย่างน้อย ' + min + ' ตัวอักษร';
    if (String(values.password || '').length > 256) errors.password = 'รหัสผ่านยาวเกินไป';
    if (!errors.username && SheetRepository.all('Users', { includeDeleted: true }).some(function (user) { return user.username === username; })) {
      errors.username = 'ชื่อผู้ใช้นี้มีผู้ใช้แล้ว';
    }
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var salt = AuthService.createSalt();
    var user = SheetRepository.insert('Users', { username: username, displayName: displayName, email: email, phone: phone,
      passwordSalt: salt, passwordHash: AuthService.hashPassword(values.password, salt), isActive: false,
      mustChangePassword: false, personnelId: '', registrationStatus: 'pending' }, 'self-registration');
    AuditService.write('USER_REGISTER', 'Users', user.id, {}, 'self-registration');
    NotifyService.notify('registration', '👤 มีผู้สมัครสมาชิกใหม่รออนุมัติ\n' + displayName + ' (' + username + ')' + (phone ? '\nโทร ' + phone : ''));
    return { registered: true };
  }

  // จำกัดการสมัครไม่เกิน 20 ครั้งต่อ 10 นาทีทั้งระบบ เพื่อกันการสมัครถล่ม
  function reserveRegistrationSlot() {
    var cache = Tenant.cache();
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      var count = Number(cache.get('register:window')) || 0;
      if (count >= 20) throw SheetRepository.serviceError('RATE_LIMITED', 'มีการสมัครจำนวนมาก กรุณาลองใหม่ภายหลัง');
      cache.put('register:window', String(count + 1), 600);
    } finally { lock.releaseLock(); }
  }

  function approve(token, data) {
    var context = AuthService.requirePermission(token, 'user.edit');
    var payload = data || {};
    var user = SheetRepository.findById('Users', payload.id);
    if (!user || user.registrationStatus !== 'pending') throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบคำขอสมัครที่รออนุมัติ');
    var result = saveUser(token, { id: user.id, version: user.version, values: { username: user.username, displayName: user.displayName,
      email: user.email, personnelId: payload.personnelId || '', isActive: true, roles: payload.roles || [] } });
    var current = SheetRepository.findById('Users', user.id);
    SheetRepository.update('Users', user.id, { registrationStatus: 'approved' }, current.version, context.user.id);
    AuditService.write('USER_APPROVE', 'Users', user.id, {}, context.user.id);
    return result;
  }

  function reject(token, data) {
    var context = AuthService.requirePermission(token, 'user.edit');
    var user = SheetRepository.findById('Users', data && data.id);
    if (!user || user.registrationStatus !== 'pending') throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบคำขอสมัครที่รออนุมัติ');
    SheetRepository.update('Users', user.id, { registrationStatus: 'rejected', isActive: false, isDeleted: true }, user.version, context.user.id);
    AuditService.write('USER_REJECT', 'Users', user.id, {}, context.user.id);
    return { id: user.id };
  }

  function resetPassword(token, data) {
    var context = AuthService.requirePermission(token, 'user.edit');
    var user = SheetRepository.findById('Users', data && data.id);
    if (!user) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบผู้ใช้');
    validatePassword(data.password, 'password');
    var salt = AuthService.createSalt();
    SheetRepository.update('Users', user.id, { passwordSalt: salt, passwordHash: AuthService.hashPassword(data.password, salt),
      mustChangePassword: true }, user.version, context.user.id);
    AuditService.write('USER_PASSWORD_RESET', 'Users', user.id, {}, context.user.id);
    return { ok: true };
  }

  // ---------- สร้างบัญชีให้บุคลากรที่ยังไม่มีบัญชี (ผู้ดูแลระบบเป็นคนออกให้) ----------
  var PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

  function randomPassword() {
    var hex = Utilities.getUuid().replace(/-/g, '');
    var text = '';
    for (var index = 0; index < 8; index += 1) text += PASSWORD_ALPHABET.charAt(parseInt(hex.substr(index * 2, 2), 16) % PASSWORD_ALPHABET.length);
    return text;
  }

  // บุคลากรที่ยังไม่มีบัญชี ใช้แสดงจำนวนก่อนสร้าง
  function accountCandidates(token) {
    AuthService.requirePermission(token, 'user.add');
    var linked = {};
    SheetRepository.all('Users').forEach(function (user) { if (user.personnelId) linked[user.personnelId] = true; });
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    return { candidates: SheetRepository.all('Personnel').filter(function (person) { return !linked[person.id]; }).map(function (person) {
      return { id: person.id, code: person.personnelCode, name: ((titles[person.titleId] || {}).name || '') + person.firstName + ' ' + person.lastName };
    }) };
  }

  // สร้างบัญชีทีละชุด (แต่ละบัญชีต้องเข้ารหัสผ่าน จึงให้หน้าเว็บเรียกทีละไม่เกิน 12 คน)
  // รหัสผ่านเริ่มต้นสุ่มให้และแสดงกลับครั้งเดียว ผู้ใช้ต้องเปลี่ยนเองเมื่อเข้าสู่ระบบครั้งแรก
  function bulkCreate(token, data) {
    var context = AuthService.requirePermission(token, 'user.add');
    var payload = data || {};
    var ids = (payload.personnelIds || []).slice(0, 12);
    var role = SheetRepository.all('Roles').filter(function (row) { return row.key === String(payload.role || 'teacher'); })[0];
    if (!role || role.key === 'admin') throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบบทบาทที่เลือก');
    var existing = SheetRepository.all('Users', { includeDeleted: true });
    var taken = {};
    existing.forEach(function (user) { taken[user.username] = true; });
    var linked = {};
    existing.forEach(function (user) { if (user.personnelId && user.isDeleted !== true) linked[user.personnelId] = true; });
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var created = [];
    var rows = [];
    ids.forEach(function (personnelId) {
      var person = SheetRepository.findById('Personnel', personnelId);
      if (!person || linked[person.id]) return;
      var base = String(person.personnelCode || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (base.length < 3) base = 'user' + base;
      var username = base;
      for (var suffix = 2; taken[username]; suffix += 1) username = base + suffix;
      taken[username] = true;
      var password = randomPassword();
      var salt = AuthService.createSalt();
      var displayName = ((((titles[person.titleId] || {}).name) || '') + person.firstName + ' ' + person.lastName).trim();
      rows.push({ username: username, displayName: displayName, email: person.email || '', personnelId: person.id, isActive: true,
        passwordSalt: salt, passwordHash: AuthService.hashPassword(password, salt), mustChangePassword: true });
      created.push({ username: username, displayName: displayName, password: password });
    });
    var users = SheetRepository.insertMany('Users', rows, context.user.id);
    if (users.length) {
      SheetRepository.replaceRows('UserRoles', function () { return false; },
        users.map(function (user) { return Core.createRecord({ userId: user.id, roleId: role.id }, context.user.id); }));
      AuditService.write('USER_BULK_CREATE', 'Users', 'bulk', { count: users.length, role: role.key }, context.user.id);
    }
    return { created: created };
  }

  function deleteUser(token, data) {
    var context = AuthService.requirePermission(token, 'user.delete');
    if (String(data && data.id) === String(context.user.id)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่สามารถลบบัญชีของตนเองได้');
    var user = SheetRepository.findById('Users', data && data.id);
    if (!user) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบผู้ใช้');
    SheetRepository.update('Users', user.id, { isDeleted: true, isActive: false }, user.version, context.user.id);
    AuditService.write('USER_DELETE', 'Users', user.id, {}, context.user.id);
    return { id: user.id };
  }

  function listRoles(token) {
    var context = AuthService.requirePermission(token, 'role.view');
    var permissions = SheetRepository.all('Permissions');
    var permissionKeys = EntityService.indexBy(permissions);
    var granted = SheetRepository.all('RolePermissions').reduce(function (index, row) {
      if (permissionKeys[row.permissionId]) (index[row.roleId] = index[row.roleId] || []).push(permissionKeys[row.permissionId].key);
      return index;
    }, {});
    return {
      roles: SheetRepository.all('Roles').map(function (role) {
        return { id: role.id, key: role.key, name: role.name, permissions: granted[role.id] || [] };
      }),
      permissions: permissions.map(function (row) { return row.key; }).sort(),
      modules: APP_CONFIG.MODULES.map(function (module) { return { name: module.name, category: module.category, permission: module.permission }; }),
      canEdit: Core.hasPermission(context.permissions, 'role.edit')
    };
  }

  function saveRole(token, data) {
    var payload = data || {};
    var context = AuthService.requirePermission(token, 'role.edit');
    var roles = SheetRepository.all('Roles');
    var role = payload.id ? roles.filter(function (row) { return String(row.id) === String(payload.id); })[0] : null;
    var name = String(payload.name || '').trim().slice(0, 100);
    if (!name) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาระบุชื่อบทบาท', { name: 'กรุณาระบุชื่อบทบาท' });
    if (role && role.key === 'admin') throw SheetRepository.serviceError('VALIDATION_ERROR', 'บทบาทผู้ดูแลระบบได้รับทุกสิทธิ์เสมอ');
    if (!role) {
      var key = String(payload.key || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{2,30}$/.test(key)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'รหัสบทบาทใช้ a-z 0-9 - (2-30 ตัว)', { key: 'รูปแบบไม่ถูกต้อง' });
      if (roles.some(function (row) { return row.key === key; })) throw SheetRepository.serviceError('VALIDATION_ERROR', 'รหัสบทบาทซ้ำ', { key: 'รหัสซ้ำ' });
      role = SheetRepository.insert('Roles', { key: key, name: name }, context.user.id);
    } else if (role.name !== name) {
      role = SheetRepository.update('Roles', role.id, { name: name }, role.version, context.user.id);
    }
    var permissions = SheetRepository.all('Permissions');
    var wanted = permissions.filter(function (row) { return (payload.permissions || []).indexOf(row.key) !== -1; });
    SheetRepository.replaceRows('RolePermissions', function (row) { return String(row.roleId) === String(role.id); },
      wanted.map(function (permission) { return Core.createRecord({ roleId: role.id, permissionId: permission.id }, context.user.id); }));
    AuditService.write('ROLE_SAVE', 'Roles', role.id, { count: wanted.length }, context.user.id);
    return { id: role.id };
  }

  function profile(token) {
    var context = AuthService.requireSession(token);
    var personnel = context.user.personnelId ? SheetRepository.findById('Personnel', context.user.personnelId) : null;
    return { user: Core.publicUser(context.user, context.roles, context.permissions), personnel: personnel,
      passwordMinLength: APP_CONFIG.PASSWORD_MIN_LENGTH || 6 };
  }

  return { accountCandidates: accountCandidates, bulkCreate: bulkCreate, register: register, approve: approve, reject: reject, listUsers: listUsers, saveUser: saveUser, resetPassword: resetPassword, deleteUser: deleteUser,
    listRoles: listRoles, saveRole: saveRole, profile: profile };
})();
