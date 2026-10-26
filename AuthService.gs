var AuthService = (function () {
  'use strict';

  function digest(value) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  function createSalt() {
    return Utilities.getUuid().replace(/-/g, '');
  }

  function hashPassword(password, salt) {
    var iterations = Number(APP_CONFIG.PASSWORD_KDF_ITERATIONS) || 10000;
    return 'v3$' + iterations + '$' + pbkdf2Sha256(password, salt, iterations);
  }

  function deriveLegacyV2(password, salt, iterations) {
    var value = salt + ':' + String(password);
    for (var index = 0; index < iterations; index += 1) value = digest(value + ':' + salt);
    return value;
  }

  function pbkdf2Sha256(password, salt, iterations) {
    var pepper = Tenant.props().getProperty('PASSWORD_PEPPER') || '';
    var key = Utilities.newBlob(String(password) + pepper).getBytes();
    var saltBytes = Utilities.newBlob(String(salt)).getBytes().concat([0, 0, 0, 1]);
    var block = Utilities.computeHmacSha256Signature(saltBytes, key);
    var result = block.slice();
    for (var iteration = 1; iteration < iterations; iteration += 1) {
      block = Utilities.computeHmacSha256Signature(block, key);
      for (var index = 0; index < result.length; index += 1) result[index] = result[index] ^ block[index];
    }
    return bytesToHex(result);
  }

  function bytesToHex(bytes) {
    return bytes.map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  function verifyPassword(password, salt, storedHash) {
    var parts = String(storedHash || '').split('$');
    if (parts.length === 3 && parts[0] === 'v3') {
      var iterations = Number(parts[1]);
      if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 100000) return false;
      return safeEquals(pbkdf2Sha256(password, salt, iterations), parts[2]);
    }
    if (parts.length === 3 && parts[0] === 'v2') {
      var legacyIterations = Number(parts[1]);
      if (!Number.isFinite(legacyIterations) || legacyIterations < 1000 || legacyIterations > 100000) return false;
      pbkdf2Sha256(password, 'timing-equalizer', Number(APP_CONFIG.PASSWORD_KDF_ITERATIONS) || 10000);
      return safeEquals(deriveLegacyV2(password, salt, legacyIterations), parts[2]);
    }
    pbkdf2Sha256(password, 'timing-equalizer', Number(APP_CONFIG.PASSWORD_KDF_ITERATIONS) || 10000);
    return safeEquals(digest(salt + ':' + String(password)), storedHash);
  }

  function verifyInteractivePassword(password, salt, storedHash) {
    var parts = String(storedHash || '').split('$');
    if (parts.length === 3 && parts[0] === 'v3') {
      return verifyPassword(password, salt, storedHash);
    }
    return verifyPassword(password, 'dummy-salt', dummyPasswordHash());
  }

  function dummyPasswordHash() {
    return 'v3$' + (Number(APP_CONFIG.PASSWORD_KDF_ITERATIONS) || 10000) + '$' + new Array(65).join('0');
  }

  function isCanonicalInteractiveHash(storedHash) {
    var parts = String(storedHash || '').split('$');
    var currentIterations = Number(APP_CONFIG.PASSWORD_KDF_ITERATIONS) || 10000;
    return parts.length === 3 && parts[0] === 'v3' && /^\d+$/.test(parts[1]) &&
      Number(parts[1]) === currentIterations && /^[a-f0-9]{64}$/.test(parts[2]);
  }

  function safeEquals(left, right) {
    left = String(left || '');
    right = String(right || '');
    var mismatch = left.length ^ right.length;
    var maxLength = Math.max(left.length, right.length);
    for (var index = 0; index < maxLength; index += 1) {
      mismatch |= (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^
        (right.charCodeAt(index % Math.max(1, right.length)) || 0);
    }
    return mismatch === 0;
  }

  function login(payload) {
    var errors = Core.validateRequired(payload || {}, ['username', 'password']);
    if (payload && String(payload.username || '').length > 128) errors.username = 'ข้อมูลยาวเกินกำหนด';
    if (payload && String(payload.password || '').length > 256) errors.password = 'ข้อมูลยาวเกินกำหนด';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var username = Core.normalizeUsername(payload.username);
    reserveLoginAttempt(username);
    var user = SheetRepository.find('Users', function (item) {
      return Core.normalizeUsername(item.username) === username;
    })[0];
    var isPending = !!user && user.registrationStatus === 'pending';
    var canAuthenticate = user && (user.isActive !== false || isPending);
    var isCurrentHash = canAuthenticate && isCanonicalInteractiveHash(user.passwordHash);
    var verificationSalt = isCurrentHash ? user.passwordSalt : 'dummy-salt';
    var verificationHash = isCurrentHash ? user.passwordHash : dummyPasswordHash();
    var passwordMatches = verifyInteractivePassword(payload.password, verificationSalt, verificationHash);
    if (!canAuthenticate || !passwordMatches) {
      throw SheetRepository.serviceError('INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    if (isPending) throw SheetRepository.serviceError('PENDING_APPROVAL', 'บัญชีนี้อยู่ระหว่างรอผู้ดูแลระบบอนุมัติ');
    clearLoginFailures(username);
    var token = Utilities.getUuid() + Utilities.getUuid();
    // จดจำการเข้าสู่ระบบบนเครื่องนี้ (แอปมือถือ) อยู่ได้นานกว่าเซสชันปกติ ออกจากระบบเมื่อไหร่ก็หมดอายุทันที
    var ttl = payload.remember === true ? (APP_CONFIG.REMEMBER_TTL_SECONDS || 14 * 24 * 60 * 60) : APP_CONFIG.SESSION_TTL_SECONDS;
    var expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    var session = SheetRepository.insert('Sessions', { userId: user.id, tokenHash: digest(token), expiresAt: expiresAt, revokedAt: '' }, user.id);
    cacheSession(session);
    var access = loadAccess(user.id);
    AuditService.write('AUTH_LOGIN', 'User', user.id, {}, user.id);
    return { token: token, expiresAt: expiresAt, user: Core.publicUser(user, access.roles, access.permissions) };
  }

  function logout(token) {
    var session = getSession(token);
    if (session) {
  forgetSession(session.tokenHash);
      var ctxCache = sessionCache();
      if (ctxCache) { try { ctxCache.remove('ctx:' + accessEpoch(ctxCache) + ':' + session.tokenHash); } catch (error) { /* ignore */ } }
      SheetRepository.update('Sessions', session.id, { revokedAt: Core.nowIso() }, session.version, session.userId);
      AuditService.write('AUTH_LOGOUT', 'User', session.userId, {}, session.userId);
    }
    return { loggedOut: true };
  }

  var ACCESS_CACHE_TTL_SECONDS = 300;

  function accessEpoch(cache) {
    try { return cache.get('auth:epoch') || '0'; } catch (error) { return '0'; }
  }

  // บริบทผู้ใช้ที่แคชไว้ทั้งก้อน: 1 คำขอ = อ่านแคช 2 ครั้ง แทนการอ่านตาราง 5 ตาราง
  function requireSession(token) {
    var cache = sessionCache();
    var key = '';
    if (cache && typeof token === 'string' && token && token.length <= 256) {
      key = 'ctx:' + accessEpoch(cache) + ':' + digest(token);
      try {
        var hit = JSON.parse(cache.get(key) || 'null');
        if (hit && hit.session && !hit.session.revokedAt && isFutureTimestamp(hit.session.expiresAt)) return hit;
      } catch (error) { /* อ่านใหม่จากตาราง */ }
    }
    var context = loadContext(token);
    if (cache && key) { try { cache.put(key, JSON.stringify(context), ACCESS_CACHE_TTL_SECONDS); } catch (error) { /* ignore */ } }
    return context;
  }

  function loadContext(token) {
    var session = getSession(token);
    if (!session || session.revokedAt || !isFutureTimestamp(session.expiresAt)) {
      throw SheetRepository.serviceError('UNAUTHENTICATED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    var user = SheetRepository.findById('Users', session.userId);
    if (!user || user.isActive === false) throw SheetRepository.serviceError('UNAUTHENTICATED', 'บัญชีไม่พร้อมใช้งาน');
    var access = loadAccess(user.id);
    return { session: session, user: user, roles: access.roles, permissions: access.permissions };
  }

  function isFutureTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
    var timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return false;
    var normalized = value.length === 20 ? value.slice(0, -1) + '.000Z' : value;
    return new Date(timestamp).toISOString() === normalized;
  }

  function rateKey(username) {
    return 'login:user:' + digest(username).slice(0, 24);
  }

  function readCount(cache, key) {
    var count = Number(cache.get(key));
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function reserveLoginAttempt(username) {
    withLoginLock(function () {
      var cache = Tenant.cache();
      reserveSystemLoginCapacity(cache);
      var userKey = rateKey(username);
      var currentCount = readCount(cache, userKey);
      if (cache.get(userKey + ':blocked') || currentCount >= APP_CONFIG.LOGIN_MAX_ATTEMPTS) {
        throw SheetRepository.serviceError('RATE_LIMITED', 'ไม่สามารถเข้าสู่ระบบได้ในขณะนี้ กรุณารอสักครู่');
      }
      var ttl = APP_CONFIG.LOGIN_WINDOW_SECONDS;
      var userCount = currentCount + 1;
      cache.put(userKey, String(userCount), ttl);
      cache.put('login:global', String(readCount(cache, 'login:global') + 1), ttl);
      if (userCount >= 3) cache.put(userKey + ':blocked', '1', Math.min(60, Math.pow(2, userCount - 3)));
    });
  }

  function reserveSystemLoginCapacity(cache) {
    var capacity = Number(APP_CONFIG.SYSTEM_LOGIN_BUCKET_CAPACITY) || 120;
    var refillPerSecond = Number(APP_CONFIG.SYSTEM_LOGIN_REFILL_PER_SECOND) || 1;
    var nowMs = Date.now();
    var stored;
    try { stored = JSON.parse(cache.get('login:system:bucket') || 'null'); } catch (error) { stored = null; }
    var previousTokens = stored && Number.isFinite(Number(stored.tokens)) ? Number(stored.tokens) : capacity;
    var previousTimestamp = stored && Number.isFinite(Number(stored.updatedAtMs)) ? Number(stored.updatedAtMs) : nowMs;
    var elapsedSeconds = Math.max(0, nowMs - previousTimestamp) / 1000;
    var availableTokens = Math.min(capacity, previousTokens + elapsedSeconds * refillPerSecond);
    if (availableTokens < 1) {
      var retryAfter = Math.max(1, Math.ceil((1 - availableTokens) / refillPerSecond));
      var rateError = SheetRepository.serviceError('RATE_LIMITED', 'ระบบมีคำขอเข้าสู่ระบบจำนวนมาก กรุณารอสักครู่');
      rateError.retryAfter = retryAfter;
      throw rateError;
    }
    var bucket = { tokens: availableTokens - 1, updatedAtMs: nowMs };
    var ttl = Math.max(APP_CONFIG.LOGIN_WINDOW_SECONDS, Math.ceil(capacity / refillPerSecond) * 2);
    cache.put('login:system:bucket', JSON.stringify(bucket), ttl);
  }

  function clearLoginFailures(username) {
    withLoginLock(function () {
      var cache = Tenant.cache();
      cache.remove(rateKey(username));
      cache.remove(rateKey(username) + ':blocked');
    });
  }

  function withLoginLock(callback) {
    var lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try { return callback(); } finally { lock.releaseLock(); }
  }

  function requirePermission(token, permission) {
    var context = requireSession(token);
    if (!Core.hasPermission(context.permissions, permission)) {
      throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่มีสิทธิ์ดำเนินการนี้');
    }
    return context;
  }

  function changePassword(token, payload) {
    var context = requireSession(token);
    var errors = Core.validateRequired(payload || {}, ['currentPassword', 'newPassword']);
    var minLength = APP_CONFIG.PASSWORD_MIN_LENGTH || 12;
    if (payload && payload.newPassword && String(payload.newPassword).length < minLength) {
      errors.newPassword = 'รหัสผ่านใหม่ต้องมีอย่างน้อย ' + minLength + ' ตัวอักษร';
    }
    if (payload && String(payload.currentPassword || '').length > 256) errors.currentPassword = 'ข้อมูลยาวเกินกำหนด';
    if (payload && String(payload.newPassword || '').length > 256) errors.newPassword = 'ข้อมูลยาวเกินกำหนด';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    if (!verifyPassword(payload.currentPassword, context.user.passwordSalt, context.user.passwordHash)) {
      throw SheetRepository.serviceError('INVALID_CREDENTIALS', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    var users = cloneRecords(SheetRepository.all('Users', { includeDeleted: true }));
    var sessions = cloneRecords(SheetRepository.all('Sessions', { includeDeleted: true }));
    var expected = {
      Users: versionsFor(users),
      Sessions: versionsFor(sessions)
    };
    var user = users.filter(function (item) { return String(item.id) === String(context.user.id); })[0];
    if (!user) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
    var salt = createSalt();
    Object.assign(user, updatedFields(user, context.user.id), {
      passwordSalt: salt, passwordHash: hashPassword(payload.newPassword, salt), mustChangePassword: false
    });
    sessions.forEach(function (session) {
      if (String(session.userId) === String(context.user.id) && session.id !== context.session.id && !session.revokedAt) {
        forgetSession(session.tokenHash);
        Object.assign(session, updatedFields(session, context.user.id), { revokedAt: Core.nowIso() });
      }
    });
    SheetRepository.replaceTablesAtomically({ Users: users, Sessions: sessions }, expected);
    AuditService.write('PASSWORD_CHANGED', 'User', context.user.id, {}, context.user.id);
    return { changed: true };
  }

  function cloneRecords(records) {
    return records.map(function (record) { return Object.assign({}, record); });
  }

  function updatedFields(record, actorId) {
    return { updatedAt: Core.nowIso(), updatedBy: actorId, version: Number(record.version) + 1 };
  }

  function versionsFor(records) {
    return records.reduce(function (versions, record) {
      versions[record.id] = record.version;
      return versions;
    }, { __count: records.length });
  }

  function getSession(token) {
    if (typeof token !== 'string' || !token || token.length > 256) return null;
    var tokenHash = digest(token);
    var cached = readCachedSession(tokenHash);
    if (cached) return cached;
    var session = SheetRepository.findByField('Sessions', 'tokenHash', tokenHash).filter(function (item) {
      return safeEquals(item.tokenHash, tokenHash);
    })[0] || null;
    if (session && !session.revokedAt) cacheSession(session);
    return session;
  }

  // เก็บ session ที่ยังใช้งานได้ไว้ใน CacheService เพื่อไม่ต้องอ่านตาราง Sessions ทุกคำขอ
  var SESSION_CACHE_TTL_SECONDS = 6 * 60 * 60;

  function sessionCache() {
    return Tenant.cache();
  }

  function readCachedSession(tokenHash) {
    var cache = sessionCache();
    if (!cache) return null;
    try {
      var cached = JSON.parse(cache.get('sess:' + tokenHash) || 'null');
      return cached && safeEquals(cached.tokenHash, tokenHash) ? cached : null;
    } catch (error) { return null; }
  }

  function cacheSession(session) {
    var cache = sessionCache();
    if (!cache || !session || !session.tokenHash) return;
    try { cache.put('sess:' + session.tokenHash, JSON.stringify(session), SESSION_CACHE_TTL_SECONDS); } catch (error) { /* ignore */ }
  }

  function forgetSession(tokenHash) {
    var cache = sessionCache();
    if (cache && tokenHash) { try { cache.remove('sess:' + tokenHash); } catch (error) { /* ignore */ } }
  }

  function loadAccess(userId) {
    var userRoles = SheetRepository.find('UserRoles', function (item) { return String(item.userId) === String(userId); });
    var roleIds = userRoles.map(function (item) { return String(item.roleId); });
    var roles = SheetRepository.all('Roles').filter(function (role) { return roleIds.indexOf(String(role.id)) !== -1; });
    var rolePermissions = SheetRepository.all('RolePermissions').filter(function (item) { return roleIds.indexOf(String(item.roleId)) !== -1; });
    var permissionIds = rolePermissions.map(function (item) { return String(item.permissionId); });
    var permissions = SheetRepository.all('Permissions').filter(function (permission) {
      return permissionIds.indexOf(String(permission.id)) !== -1;
    }).map(function (permission) { return permission.key; });
    return { roles: roles.map(function (role) { return role.key; }), permissions: permissions };
  }

  return { digest: digest, createSalt: createSalt, hashPassword: hashPassword, verifyPassword: verifyPassword, login: login,
    logout: logout, requireSession: requireSession, requirePermission: requirePermission,
    changePassword: changePassword };
})();
