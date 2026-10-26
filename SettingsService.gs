var AuditService = {
  write: function (action, entityType, entityId, details, actorId) {
    return SheetRepository.insert('AuditLogs', {
      action: action,
      entityType: entityType,
      entityId: entityId || '',
      detailsJson: JSON.stringify(details || {}),
      ipHint: ''
    }, actorId || 'system');
  }
};

var SettingsService = (function () {
  'use strict';

  function getPublicSettings() {
    var stored = SheetRepository.all('Settings').reduce(function (settings, row) {
      try { settings[row.key] = JSON.parse(row.valueJson); } catch (error) { settings[row.key] = row.valueJson; }
      return settings;
    }, {});
    return Object.assign({}, APP_CONFIG.DEFAULT_SETTINGS, stored);
  }

  function getApplicationState(token) {
    var context = AuthService.requireSession(token);
    var modules = getModulesFor(context.permissions);
    return {
      settings: getPublicSettings(),
      user: Core.publicUser(context.user, context.roles, context.permissions),
      modules: modules,
      configurableModules: Core.hasPermission(context.permissions, 'module.toggle') ? getCatalogModules(true) : [],
      externalLinks: IntegrationService.visibleFor(context),
      lockedModules: APP_CONFIG.LOCKED_MODULES,
      menuPresets: APP_CONFIG.MENU_PRESETS,
      landingSections: APP_CONFIG.LANDING_SECTIONS,
      landingFonts: APP_CONFIG.LANDING_FONTS,
      groups: APP_CONFIG.GROUPS,
      themes: APP_CONFIG.THEMES,
      entities: APP_CONFIG.ENTITIES,
      masterRoutes: APP_CONFIG.MASTER_ROUTES,
      lookups: EntityService.lookups(token),
      ai: aiStatusFor(token),
      bots: BotService.catalog()
    };
  }

  function aiStatusFor(token) {
    try { return AiService.status(token); } catch (error) { return {}; }
  }

  function updateSettings(token, changes) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    changes = changes || {};
    var allowed = ['schoolName', 'schoolDescription', 'logoFileId', 'primaryColor', 'footerText', 'schoolAffiliation',
      'schoolAddress', 'schoolPhone', 'directorName', 'academicHeadName', 'sidebarColor', 'themeKey', 'allowSelfRegistration', 'emergencyContacts']
      .concat(PROFILE_TEXT_KEYS, LONG_TEXT_KEYS, URL_KEYS, ['coverFileId', 'directorPhotoFileId', 'gallery', 'heroSlides', 'landingSections',
        'landingStyle', 'landingTitles', 'landingOrder']);
    if (Object.prototype.hasOwnProperty.call(changes, 'allowSelfRegistration')) {
      changes.allowSelfRegistration = changes.allowSelfRegistration === true || changes.allowSelfRegistration === 'true';
    }
    allowed.forEach(function (key) {
      var limit = LONG_TEXT_KEYS.indexOf(key) !== -1 ? 4000 : 500;
      if (typeof changes[key] === 'string' && changes[key].length > limit) changes[key] = changes[key].slice(0, limit);
    });
    var errors = Core.validateRequired(changes, ['schoolName', 'primaryColor']);
    URL_KEYS.forEach(function (key) {
      if (typeof changes[key] !== 'string') return;
      changes[key] = changes[key].trim();
      if (changes[key] && !/^https:\/\/[^\s"'<>]+$/i.test(changes[key])) errors[key] = 'ลิงก์ต้องขึ้นต้นด้วย https://';
    });
    if (typeof changes.schoolEmail === 'string' && changes.schoolEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.schoolEmail.trim())) errors.schoolEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
    ['coverFileId', 'directorPhotoFileId', 'logoFileId'].forEach(function (key) {
      if (changes[key] && !/^[\w-]{5,200}$/.test(String(changes[key]))) errors[key] = 'รหัสไฟล์ไม่ถูกต้อง';
    });
    if (Object.prototype.hasOwnProperty.call(changes, 'landingSections')) {
      var sections = changes.landingSections && typeof changes.landingSections === 'object' ? changes.landingSections : {};
      changes.landingSections = APP_CONFIG.LANDING_SECTIONS.reduce(function (result, section) {
        // ส่วนที่เพิ่มเข้ามาใหม่ (ยังไม่เคยบันทึก) ให้เปิดไว้ก่อน
        result[section.key] = sections[section.key] === undefined || sections[section.key] === true || sections[section.key] === 'true';
        return result;
      }, {});
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'landingStyle')) changes.landingStyle = cleanStyle(changes.landingStyle);
    if (Object.prototype.hasOwnProperty.call(changes, 'landingTitles')) changes.landingTitles = cleanTitles(changes.landingTitles);
    if (Object.prototype.hasOwnProperty.call(changes, 'landingOrder')) {
      var known = APP_CONFIG.LANDING_SECTIONS.map(function (section) { return section.key; });
      changes.landingOrder = (Array.isArray(changes.landingOrder) ? changes.landingOrder : []).map(String)
        .filter(function (key, index, list) { return known.indexOf(key) !== -1 && list.indexOf(key) === index; });
    }
    Object.keys(IMAGE_LISTS).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
      changes[key] = (Array.isArray(changes[key]) ? changes[key] : []).filter(function (item) {
        return item && /^[\w-]{5,200}$/.test(String(item.fileId || ''));
      }).map(function (item) { return { fileId: String(item.fileId), caption: String(item.caption || '').trim().slice(0, 120) }; });
      if (changes[key].length > IMAGE_LISTS[key].max()) errors[key] = IMAGE_LISTS[key].name + 'ได้ไม่เกิน ' + IMAGE_LISTS[key].max() + ' ภาพ';
    });
    ['primaryColor', 'sidebarColor'].forEach(function (key) {
      if (changes && changes[key] && !/^#[0-9a-f]{6}$/i.test(changes[key])) errors[key] = 'กรุณาระบุรหัสสีรูปแบบ #RRGGBB';
    });
    if (Object.prototype.hasOwnProperty.call(changes, 'emergencyContacts')) {
      var contacts = Array.isArray(changes.emergencyContacts) ? changes.emergencyContacts : [];
      changes.emergencyContacts = contacts.map(function (item) {
        return { name: String((item && item.name) || '').trim().slice(0, 80), phone: String((item && item.phone) || '').trim().slice(0, 20) };
      }).filter(function (item) { return item.name || item.phone; });
      if (changes.emergencyContacts.length > 20) errors.emergencyContacts = 'เพิ่มได้ไม่เกิน 20 รายการ';
      if (changes.emergencyContacts.some(function (item) { return !item.name || !/^[0-9+# -]{3,20}$/.test(item.phone); })) {
        errors.emergencyContacts = 'กรุณากรอกชื่อและเบอร์โทรให้ครบ (ตัวเลขเท่านั้น)';
      }
    }
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var settings = SheetRepository.all('Settings', { includeDeleted: true });
    var expectedVersions = versionsFor(settings);
    allowed.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) return;
      var existing = settings.filter(function (row) { return row.key === key && row.isDeleted !== true; })[0];
      var values = { key: key, valueJson: JSON.stringify(changes[key]) };
      if (existing) {
        Object.assign(existing, values, updatedFields(existing, context.user.id));
      } else settings.push(Core.createRecord(values, context.user.id));
    });
    var changedKeys = allowed.filter(function (key) {
      return Object.prototype.hasOwnProperty.call(changes, key);
    });
    SheetRepository.replaceTablesAtomically({ Settings: settings }, { Settings: expectedVersions });
    AuditService.write('SETTINGS_UPDATE', 'Settings', 'branding', { keys: changedKeys }, context.user.id);
    return getPublicSettings();
  }

  function updateModules(token, moduleStates) {
    var context = AuthService.requirePermission(token, 'module.toggle');
    (moduleStates || []).forEach(function (state) {
      if (state && state.isEnabled !== true && APP_CONFIG.LOCKED_MODULES.indexOf(state.key) !== -1) {
        throw SheetRepository.serviceError('VALIDATION_ERROR', 'เมนูนี้จำเป็นต่อการดูแลระบบ ปิดไม่ได้');
      }
    });
    var modules = SheetRepository.all('Modules', { includeDeleted: true });
    var expectedVersions = versionsFor(modules);
    var seen = {};
    (moduleStates || []).forEach(function (state) {
      if (!state || seen[state.key]) throw SheetRepository.serviceError('VALIDATION_ERROR', 'รายการโมดูลไม่ถูกต้อง');
      seen[state.key] = true;
      var moduleRow = modules.filter(function (row) { return row.key === state.key && row.isDeleted !== true; })[0];
      if (!moduleRow) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบโมดูลที่ระบุ');
      Object.assign(moduleRow, { isEnabled: state.isEnabled === true }, updatedFields(moduleRow, context.user.id));
    });
    SheetRepository.replaceTablesAtomically({ Modules: modules }, { Modules: expectedVersions });
    AuditService.write('MODULES_UPDATE', 'Modules', '', { count: (moduleStates || []).length }, context.user.id);
    return getModulesFor(context.permissions);
  }

  var PROFILE_TEXT_KEYS = ['schoolNameEn', 'schoolCode', 'schoolLevels', 'schoolEstablished', 'schoolMotto', 'schoolPhilosophy',
    'schoolIdentity', 'schoolColors', 'schoolTree', 'schoolEmail'];
  var LONG_TEXT_KEYS = ['schoolVision', 'schoolMission', 'schoolGoals', 'schoolHistory', 'directorMessage', 'tickerMessages'];
  var URL_KEYS = ['schoolWebsite', 'schoolFacebook', 'schoolMapUrl', 'systemUrl'];

  // ---------- ตัวออกแบบหน้าแรก ----------
  var STYLE_COLORS = ['heroText', 'heroOverlay', 'heading', 'text', 'accent', 'dark', 'pageBg', 'cardBg', 'footerBg', 'footerText', 'tickerBg', 'tickerText'];
  var STYLE_NUMBERS = { heroOverlayOpacity: [0, 95], fontScale: [85, 130], heroHeight: [50, 100], tickerSpeed: [20, 200] };

  function cleanStyle(input) {
    var style = input && typeof input === 'object' ? input : {};
    var result = {};
    STYLE_COLORS.forEach(function (key) { if (/^#[0-9a-f]{6}$/i.test(String(style[key] || ''))) result[key] = String(style[key]).toLowerCase(); });
    Object.keys(STYLE_NUMBERS).forEach(function (key) {
      var value = Number(style[key]);
      if (style[key] !== '' && style[key] !== null && style[key] !== undefined && isFinite(value)) {
        result[key] = Math.min(STYLE_NUMBERS[key][1], Math.max(STYLE_NUMBERS[key][0], Math.round(value)));
      }
    });
    ['bodyFont', 'headingFont'].forEach(function (key) { if (APP_CONFIG.LANDING_FONTS.indexOf(style[key]) !== -1) result[key] = style[key]; });
    if (style.heroAlign === 'center' || style.heroAlign === 'left') result.heroAlign = style.heroAlign;
    return result;
  }

  function cleanTitles(input) {
    var titles = input && typeof input === 'object' ? input : {};
    var result = {};
    APP_CONFIG.LANDING_SECTIONS.map(function (section) { return section.key; }).concat(['hero']).forEach(function (key) {
      var item = titles[key];
      if (!item || typeof item !== 'object') return;
      var clean = {};
      [['nav', 40], ['kicker', 60], ['title', 120], ['button', 40]].forEach(function (field) {
        var value = String(item[field[0]] || '').trim().slice(0, field[1]);
        if (value) clean[field[0]] = value;
      });
      if (Object.keys(clean).length) result[key] = clean;
    });
    return result;
  }

  // เก็บไฟล์รูปอย่างเดียว (ยังไม่ผูกกับการตั้งค่า) ใช้ตอนกดบันทึกในตัวออกแบบหน้าแรก
  function storeImage(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    data = data || {};
    var bytes = Utilities.base64Decode(String(data.base64 || ''));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไฟล์รูปภาพต้องไม่เกิน 5 MB');
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(String(data.mimeType || ''))) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกไฟล์รูปภาพ PNG, JPG, GIF หรือ WEBP');
    }
    var file = FolderService.getFolder('branding').createFile(Utilities.newBlob(bytes, data.mimeType, 'landing-' + Date.now()));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) { /* บางองค์กรห้ามแชร์ลิงก์ */ }
    AuditService.write('IMAGE_UPLOAD', 'Settings', 'landing', {}, context.user.id);
    return { fileId: file.getId() };
  }

  function imageIdsOf(settings) {
    var ids = ['logoFileId', 'coverFileId', 'directorPhotoFileId'].map(function (key) { return settings[key]; });
    Object.keys(IMAGE_LISTS).forEach(function (key) { (settings[key] || []).forEach(function (item) { ids.push(item.fileId); }); });
    return ids.filter(Boolean);
  }

  // บันทึกจากตัวออกแบบหน้าแรก แล้วย้ายรูปที่ไม่ได้ใช้แล้วไปถังขยะของ Drive (กู้คืนได้ 30 วัน)
  function saveLanding(token, changes) {
    AuthService.requirePermission(token, 'settings.edit');
    var before = imageIdsOf(getPublicSettings());
    var saved = updateSettings(token, Object.assign({}, getPublicSettings(), changes || {}));
    var after = imageIdsOf(saved);
    before.filter(function (id) { return after.indexOf(id) === -1; }).forEach(function (id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (error) { /* ไฟล์อาจถูกลบไปแล้ว */ }
    });
    return saved;
  }

  function uploadLogo(token, data) {
    return uploadImage(token, Object.assign({}, data, { kind: 'logo' }));
  }

  // อัปโหลดรูป (ตรา, ภาพปก, รูปผู้บริหาร, ภาพบรรยากาศ) ไปโฟลเดอร์ branding และเปิดให้ทุกคนที่มีลิงก์ดูได้ เพราะแสดงบนหน้าแรก
  var IMAGE_KINDS = { logo: 'logoFileId', cover: 'coverFileId', director: 'directorPhotoFileId', gallery: 'gallery', slide: 'heroSlides' };
  // รูปที่เก็บเป็นรายการหลายภาพ
  var IMAGE_LISTS = {
    gallery: { name: 'ภาพบรรยากาศ', max: function () { return APP_CONFIG.MAX_GALLERY_IMAGES; } },
    heroSlides: { name: 'ภาพสไลด์หน้าแรก', max: function () { return APP_CONFIG.MAX_HERO_SLIDES || 10; } }
  };

  function uploadImage(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    data = data || {};
    var target = IMAGE_KINDS[data.kind];
    if (!target) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ประเภทรูปภาพไม่ถูกต้อง');
    var bytes = Utilities.base64Decode(String(data.base64 || ''));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไฟล์รูปภาพต้องไม่เกิน 5 MB');
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(String(data.mimeType || ''))) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาเลือกไฟล์รูปภาพ PNG, JPG, GIF หรือ WEBP');
    }
    var current = getPublicSettings();
    if (IMAGE_LISTS[target] && (current[target] || []).length >= IMAGE_LISTS[target].max()) {
      throw SheetRepository.serviceError('VALIDATION_ERROR', IMAGE_LISTS[target].name + 'ได้ไม่เกิน ' + IMAGE_LISTS[target].max() + ' ภาพ');
    }
    var file = FolderService.getFolder('branding').createFile(Utilities.newBlob(bytes, data.mimeType, data.kind + '-' + Date.now()));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) { /* บางองค์กรห้ามแชร์ลิงก์ รูปจะเห็นเฉพาะคนในองค์กร */ }
    AuditService.write('IMAGE_UPLOAD', 'Settings', data.kind, {}, context.user.id);
    var changes = {};
    if (IMAGE_LISTS[target]) {
      changes[target] = (current[target] || []).concat([{ fileId: file.getId(), caption: String(data.caption || '').slice(0, 120) }]);
    } else changes[target] = file.getId();
    return updateSettings(token, Object.assign({}, current, changes));
  }

  // เอารูปออกจากหน้าแรก (ย้ายไฟล์ไปถังขยะของ Drive ซึ่งกู้คืนได้ 30 วัน)
  function removeImage(token, data) {
    AuthService.requirePermission(token, 'settings.edit');
    data = data || {};
    var current = getPublicSettings();
    var fileId = String(data.fileId || '');
    var changes = {};
    var target = IMAGE_KINDS[data.kind];
    if (IMAGE_LISTS[target]) changes[target] = (current[target] || []).filter(function (item) { return item.fileId !== fileId; });
    else if (target) { fileId = current[target]; changes[target] = ''; }
    else throw SheetRepository.serviceError('VALIDATION_ERROR', 'ประเภทรูปภาพไม่ถูกต้อง');
    var saved = updateSettings(token, Object.assign({}, current, changes));
    if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (error) { /* ไฟล์อาจถูกลบไปแล้ว */ } }
    return saved;
  }

  // ---------- ข้อความบนหน้าจอที่ผู้ดูแลระบบแก้ไขเองได้ (โหมดแก้ไขข้อความ) ----------
  // คีย์: m:เมนู (ชื่อเมนู) g:หมวด d:เมนู (คำอธิบายใต้ชื่อหน้า) e:โมดูล (หัวตาราง) f:โมดูล.ช่อง (ชื่อช่องข้อมูล) s:ข้อความทั่วไป
  var TEXT_KEY = /^[mgdefs]:[A-Za-z0-9._-]{1,80}$/;
  var MAX_TEXTS = 800;

  function saveTexts(token, data) {
    var context = AuthService.requirePermission(token, 'texts.edit');
    var changes = data && data.changes && typeof data.changes === 'object' ? data.changes : {};
    var current = getPublicSettings().uiTexts;
    var texts = current && typeof current === 'object' && !Array.isArray(current) ? Object.assign({}, current) : {};
    var errors = {};
    Object.keys(changes).forEach(function (key) {
      if (!TEXT_KEY.test(key)) { errors[key] = 'คีย์ข้อความไม่ถูกต้อง'; return; }
      var value = String(changes[key] === null || changes[key] === undefined ? '' : changes[key]).replace(/\s+/g, ' ').trim();
      var limit = key.charAt(0) === 'd' ? 600 : 200;
      if (value.length > limit) { errors[key] = 'ยาวเกิน ' + limit + ' ตัวอักษร'; return; }
      if (value) texts[key] = value; else delete texts[key];
    });
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ข้อความบางรายการไม่ถูกต้อง', errors);
    if (Object.keys(texts).length > MAX_TEXTS) throw SheetRepository.serviceError('VALIDATION_ERROR', 'แก้ไขข้อความได้ไม่เกิน ' + MAX_TEXTS + ' รายการ');
    var settings = SheetRepository.all('Settings', { includeDeleted: true });
    var expectedVersions = versionsFor(settings);
    var existing = settings.filter(function (row) { return row.key === 'uiTexts' && row.isDeleted !== true; })[0];
    var values = { key: 'uiTexts', valueJson: JSON.stringify(texts) };
    if (existing) Object.assign(existing, values, updatedFields(existing, context.user.id));
    else settings.push(Core.createRecord(values, context.user.id));
    SheetRepository.replaceTablesAtomically({ Settings: settings }, { Settings: expectedVersions });
    AuditService.write('TEXTS_UPDATE', 'Settings', 'uiTexts', { keys: Object.keys(changes).slice(0, 50) }, context.user.id);
    return { texts: texts };
  }

  function getModulesFor(permissions) {
    var replaced = IntegrationService.replacedModuleKeys();
    return getCatalogModules(false).filter(function (module) {
      return module.isEnabled !== false && replaced.indexOf(module.key) === -1 && Core.hasPermission(permissions, module.permission);
    });
  }

  function getCatalogModules(includeDisabled) {
    var storedByKey = SheetRepository.all('Modules').reduce(function (index, row) {
      index[row.key] = row;
      return index;
    }, {});
    return APP_CONFIG.MODULES.map(function (catalogModule) {
      if (!Core.isSafeRoute(catalogModule.route)) return null;
      if (catalogModule.mainOnly && !Tenant.isMain()) return null;
      var stored = storedByKey[catalogModule.key];
      if (!stored) return null;
      return Object.assign({}, stored, {
        key: catalogModule.key,
        name: catalogModule.name,
        category: catalogModule.category,
        route: catalogModule.route,
        icon: catalogModule.icon,
        color: catalogModule.color,
        permission: catalogModule.permission,
        isAvailable: catalogModule.isAvailable
      });
    }).filter(function (module) { return module && (includeDisabled || module.isEnabled !== false); });
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

  return { getPublicSettings: getPublicSettings, getApplicationState: getApplicationState,
    updateSettings: updateSettings, updateModules: updateModules, uploadLogo: uploadLogo, uploadImage: uploadImage,
    removeImage: removeImage, storeImage: storeImage, saveLanding: saveLanding, getModulesFor: getModulesFor, saveTexts: saveTexts };
})();

/**
 * หน้าแรกก่อนเข้าสู่ระบบ: ตัวเลขภาพรวม ข่าวที่เลือกเผยแพร่ และกิจกรรมที่จะถึง (ไม่มีข้อมูลรายบุคคล)
 */
var LandingService = (function () {
  'use strict';

  function get() {
    var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    return SheetRepository.memoResult('landing', function () { return build(today); }, { stamp: today, persist: 'landing',
      deps: ['AcademicYears', 'Homerooms', 'Announcements', 'CalendarEvents', 'Students', 'StudentEnrollments', 'PersonnelTypes', 'Personnel'] });
  }

  function build(today) {
    var years = SheetRepository.all('AcademicYears');
    var active = years.filter(function (year) { return year.isActive === true; })[0];
    var homerooms = SheetRepository.all('Homerooms').filter(function (row) { return !active || String(row.academicYearId) === String(active.id); });
    var news = SheetRepository.all('Announcements').filter(function (row) {
      return row.isPublic === true && (!row.publishDate || row.publishDate <= today);
    }).sort(function (a, b) {
      return (b.isPinned === true) - (a.isPinned === true) || String(b.publishDate).localeCompare(String(a.publishDate));
    }).slice(0, 6).map(function (row) {
      return { title: row.title, publishDate: row.publishDate, isPinned: row.isPinned === true, body: String(row.body || '').slice(0, 600) };
    });
    var monthStart = today.slice(0, 7) + '-01';
    var monthEnd = today.slice(0, 7) + '-31';
    var monthEvents = SheetRepository.all('CalendarEvents').filter(function (row) {
      return String(row.eventDate) <= monthEnd && String(row.endDate || row.eventDate) >= monthStart;
    }).sort(function (a, b) { return String(a.eventDate).localeCompare(String(b.eventDate)); })
      .slice(0, 30).map(function (row) { return { name: row.name, eventDate: row.eventDate, endDate: row.endDate || '' }; });
    var events = SheetRepository.all('CalendarEvents').filter(function (row) { return String(row.endDate || row.eventDate) >= today; })
      .sort(function (a, b) { return String(a.eventDate).localeCompare(String(b.eventDate)); })
      .slice(0, 6).map(function (row) { return { name: row.name, eventDate: row.eventDate, endDate: row.endDate || '' }; });
    // จำนวนนักเรียนแยกระดับชั้นและเพศ (ปีการศึกษาปัจจุบัน) และบุคลากรแยกประเภท: ตัวเลขรวมเท่านั้น
    var students = EntityService.indexBy(SheetRepository.all('Students'));
    var roomById = EntityService.indexBy(homerooms);
    var byLevel = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      var room = roomById[row.homeroomId];
      if (!room || (row.status && row.status !== 'กำลังศึกษา')) return;
      var item = byLevel[room.gradeLevel] || (byLevel[room.gradeLevel] = { level: room.gradeLevel, male: 0, female: 0, total: 0, rooms: {} });
      var gender = (students[row.studentId] || {}).gender;
      if (gender === 'ชาย') item.male += 1; else if (gender === 'หญิง') item.female += 1;
      item.total += 1;
      item.rooms[room.id] = true;
    });
    homerooms.forEach(function (room) {
      var item = byLevel[room.gradeLevel] || (byLevel[room.gradeLevel] = { level: room.gradeLevel, male: 0, female: 0, total: 0, rooms: {} });
      item.rooms[room.id] = true;
    });
    var studentsByLevel = APP_CONFIG.GRADE_LEVELS.filter(function (level) { return byLevel[level]; }).map(function (level) {
      var item = byLevel[level];
      return { level: level, rooms: Object.keys(item.rooms).length, male: item.male, female: item.female, total: item.total };
    });
    var types = EntityService.indexBy(SheetRepository.all('PersonnelTypes'));
    var byType = {};
    SheetRepository.all('Personnel').forEach(function (row) {
      var name = (types[row.personnelTypeId] || {}).name || 'อื่น ๆ';
      byType[name] = (byType[name] || 0) + 1;
    });
    return {
      month: today.slice(0, 7),
      monthEvents: monthEvents,
      studentsByLevel: studentsByLevel,
      personnelByType: Object.keys(byType).map(function (name) { return { name: name, count: byType[name] }; })
        .sort(function (a, b) { return b.count - a.count; }),
      stats: {
        students: SheetRepository.all('Students').filter(function (row) { return !row.status || row.status === 'กำลังศึกษา'; }).length,
        personnel: SheetRepository.all('Personnel').length,
        homerooms: homerooms.length,
        academicYear: active ? active.year + '/' + active.term : ''
      },
      news: news,
      events: events
    };
  }

  // ---------- สถิติวันนี้บนหน้าแรก (สาธารณะ): นักเรียนมาเรียนรายชั้น + ครูมาทำงาน ----------
  // นักเรียน: ตัวเลขเท่านั้น สถานะของวัน = สถานะที่หนักที่สุดจากทุกคาบ (ขาด > สาย > ลา > มา) ห้องที่ยังไม่เช็กชื่อไม่นับว่าขาด
  // ครู: จำนวนตามสถานะการลงเวลา ชื่อแสดงเฉพาะผู้ไปราชการ (การลาเป็นเรื่องส่วนตัว แสดงเป็นจำนวน)
  // วันนี้ยังไม่มีข้อมูล (เช้าก่อนเช็กชื่อ/วันหยุด) → ใช้วันล่าสุดที่มีข้อมูล ย้อนไม่เกิน 14 วัน
  var TODAY_LOOKBACK_DAYS = 14;
  var DAY_WEIGHT = { P: 0, E: 1, L: 2, A: 3 };

  function today() {
    var date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    return SheetRepository.memoResult('landing-today', function () { return buildToday(date); }, { stamp: date, persist: 'landing-today',
      deps: ['AttendanceSessions', 'StaffCheckins', 'AcademicYears', 'Homerooms', 'StudentEnrollments', 'Students', 'Personnel', 'Titles'] });
  }

  function dayText(value) {
    return value instanceof Date ? Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd') : String(value || '').slice(0, 10);
  }

  function latestDay(dates, date) {
    var earliest = Utilities.formatDate(new Date(Date.parse(date + 'T00:00:00Z') - TODAY_LOOKBACK_DAYS * 86400000), 'UTC', 'yyyy-MM-dd');
    return dates.filter(function (day) { return day <= date && day >= earliest; }).sort().pop() || '';
  }

  function buildToday(date) {
    var sessionDates = {};
    SheetRepository.readColumns('AttendanceSessions', ['attendanceDate']).forEach(function (row) { sessionDates[dayText(row.attendanceDate)] = true; });
    var checkins = SheetRepository.readColumns('StaffCheckins', ['checkDate', 'personnelId', 'userId', 'checkIn', 'checkOut', 'status'])
      .map(function (row) { return { day: dayText(row.checkDate), personnelId: String(row.personnelId), status: row.status, checkIn: row.checkIn }; });
    var studentDay = sessionDates[date] ? date : latestDay(Object.keys(sessionDates), date);
    var staffDays = {};
    checkins.forEach(function (row) { staffDays[row.day] = true; });
    var staffDay = staffDays[date] ? date : latestDay(Object.keys(staffDays), date);
    return { date: date, generatedAt: Core.nowIso(), students: studentsOn(studentDay), staff: staffOn(staffDay, checkins) };
  }

  function studentsOn(day) {
    var years = SheetRepository.all('AcademicYears');
    var active = years.filter(function (year) { return year.isActive === true; })[0];
    var homerooms = SheetRepository.all('Homerooms').filter(function (row) { return !active || String(row.academicYearId) === String(active.id); });
    var roomById = EntityService.indexBy(homerooms);
    var enrolled = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) {
      var room = roomById[row.homeroomId];
      if (!room || (row.status && row.status !== 'กำลังศึกษา')) return;
      enrolled[room.gradeLevel] = (enrolled[room.gradeLevel] || 0) + 1;
    });
    var worst = {};
    var studentRoom = {};
    var checkedRooms = {};
    if (day) {
      // ค้นเฉพาะแถวของวันนั้น (ถ้าชีตเก็บวันที่เป็นชนิดวันที่จน TextFinder หาไม่เจอ ค่อยอ่านทั้งตาราง)
      var sessions = SheetRepository.findByField('AttendanceSessions', 'attendanceDate', day);
      if (!sessions.length) sessions = SheetRepository.all('AttendanceSessions').filter(function (row) { return dayText(row.attendanceDate) === day; });
      sessions.forEach(function (session) {
        var room = roomById[session.homeroomId];
        if (!room || dayText(session.attendanceDate) !== day) return;
        checkedRooms[room.id] = true;
        var records = {};
        try { records = JSON.parse(session.recordsJson || '{}') || {}; } catch (error) { records = {}; }
        Object.keys(records).forEach(function (studentId) {
          var status = records[studentId] && records[studentId].s;
          if (DAY_WEIGHT[status] === undefined) return;
          if (worst[studentId] === undefined || DAY_WEIGHT[status] > DAY_WEIGHT[worst[studentId]]) worst[studentId] = status;
          studentRoom[studentId] = room.gradeLevel;
        });
      });
    }
    var byLevel = {};
    Object.keys(worst).forEach(function (studentId) {
      var level = studentRoom[studentId];
      var item = byLevel[level] || (byLevel[level] = { P: 0, L: 0, E: 0, A: 0 });
      item[worst[studentId]] += 1;
    });
    var roomsOf = {};
    homerooms.forEach(function (room) { (roomsOf[room.gradeLevel] = roomsOf[room.gradeLevel] || []).push(room.id); });
    var rate = function (item) { var checked = item.P + item.L + item.E + item.A; return checked ? Math.round((item.P + item.L) * 1000 / checked) / 10 : null; };
    var levels = APP_CONFIG.GRADE_LEVELS.filter(function (level) { return roomsOf[level] || enrolled[level]; }).map(function (level) {
      var item = byLevel[level] || { P: 0, L: 0, E: 0, A: 0 };
      return { level: level, enrolled: enrolled[level] || 0, rooms: (roomsOf[level] || []).length,
        roomsChecked: (roomsOf[level] || []).filter(function (id) { return checkedRooms[id]; }).length,
        present: item.P, late: item.L, leave: item.E, absent: item.A, checked: item.P + item.L + item.E + item.A, rate: rate(item) };
    });
    var total = levels.reduce(function (sum, item) {
      ['present', 'late', 'leave', 'absent', 'checked', 'enrolled'].forEach(function (key) { sum[key] += item[key]; });
      return sum;
    }, { present: 0, late: 0, leave: 0, absent: 0, checked: 0, enrolled: 0 });
    total.rate = total.checked ? Math.round((total.present + total.late) * 1000 / total.checked) / 10 : null;
    return { day: day, rooms: homerooms.length, roomsChecked: Object.keys(checkedRooms).length, levels: levels, total: total };
  }

  function staffOn(day, checkins) {
    var personnel = SheetRepository.all('Personnel');
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var known = EntityService.indexBy(personnel);
    var counts = { 'มาปกติ': 0, 'มาสาย': 0, 'ไปราชการ': 0, 'ลา': 0, 'ยังไม่ลงเวลา': 0 };
    var seen = {};
    var official = [];
    checkins.forEach(function (row) {
      if (!day || row.day !== day || !known[row.personnelId] || seen[row.personnelId]) return;
      seen[row.personnelId] = true;
      if (counts[row.status] === undefined) return;
      counts[row.status] += 1;
      if (row.status === 'ไปราชการ') {
        var person = known[row.personnelId];
        official.push((((titles[person.titleId] || {}).name) || '') + person.firstName + ' ' + person.lastName);
      }
    });
    counts['ยังไม่ลงเวลา'] = personnel.filter(function (person) { return !seen[String(person.id)]; }).length;
    return { day: day, total: personnel.length, counts: counts, present: counts['มาปกติ'] + counts['มาสาย'],
      official: official.sort(function (a, b) { return a.localeCompare(b, 'th'); }) };
  }

  return { get: get, today: today };
})();

/**
 * ระบบภายนอก: ผู้ดูแลระบบเพิ่มลิงก์ไปยัง web app อื่นเป็นเมนู เลือกหมวด ผู้ที่มองเห็น และแทนที่เมนูเดิมได้
 */
var IntegrationService = (function () {
  'use strict';

  var COLORS = ['sky', 'blue', 'violet', 'green', 'teal', 'cyan', 'amber', 'orange', 'rose', 'pink', 'lime', 'slate'];

  function rows() {
    return SheetRepository.all('Integrations').sort(function (a, b) {
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.name).localeCompare(String(b.name), 'th');
    });
  }

  function toPublic(row) {
    return { id: row.id, version: row.version, name: row.name, url: row.url, icon: row.icon, color: row.color, category: row.category,
      openMode: row.openMode, visibleRoles: String(row.visibleRoles || '').split(',').filter(Boolean),
      replacesModule: row.replacesModule || '', sortOrder: Number(row.sortOrder) || 0, isEnabled: row.isEnabled === true,
      description: row.description || '' };
  }

  function visibleFor(context) {
    return rows().filter(function (row) { return row.isEnabled === true; }).map(toPublic).filter(function (item) {
      return !item.visibleRoles.length || item.visibleRoles.some(function (role) { return (context.roles || []).indexOf(role) !== -1; });
    });
  }

  function replacedModuleKeys() {
    return rows().filter(function (row) { return row.isEnabled === true && row.replacesModule; })
      .map(function (row) { return String(row.replacesModule); });
  }

  function list(token) {
    AuthService.requirePermission(token, 'settings.view');
    return { items: rows().map(toPublic) };
  }

  function save(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    data = data || {};
    var input = data.values || {};
    var groupKeys = APP_CONFIG.GROUPS.map(function (group) { return group.key; }).filter(function (key) { return key !== 'top'; });
    var moduleKeys = APP_CONFIG.MODULES.map(function (module) { return module.key; });
    var values = {
      name: String(input.name || '').trim().slice(0, 80),
      url: String(input.url || '').trim().slice(0, 500),
      icon: /^fa-[a-z0-9-]{1,40}$/.test(String(input.icon || '')) ? input.icon : 'fa-link',
      color: COLORS.indexOf(input.color) !== -1 ? input.color : 'teal',
      category: groupKeys.indexOf(input.category) !== -1 ? input.category : 'external',
      openMode: input.openMode === 'embed' ? 'embed' : 'newtab',
      visibleRoles: (Array.isArray(input.visibleRoles) ? input.visibleRoles : []).map(String)
        .filter(function (key) { return /^[a-z0-9_-]{1,40}$/.test(key); }).join(','),
      replacesModule: moduleKeys.indexOf(input.replacesModule) !== -1 && APP_CONFIG.LOCKED_MODULES.indexOf(input.replacesModule) === -1
        ? input.replacesModule : '',
      sortOrder: Number(input.sortOrder) || 0,
      isEnabled: input.isEnabled === true || input.isEnabled === 'true',
      description: String(input.description || '').trim().slice(0, 300)
    };
    var errors = {};
    if (!values.name) errors.name = 'กรุณาระบุชื่อระบบ';
    if (!/^https:\/\/[^\s"'<>]+$/i.test(values.url)) errors.url = 'ลิงก์ต้องขึ้นต้นด้วย https://';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var saved;
    if (data.id) {
      var existing = SheetRepository.findById('Integrations', data.id);
      if (!existing) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบรายการ');
      saved = SheetRepository.update('Integrations', existing.id, values, data.version || existing.version, context.user.id);
    } else saved = SheetRepository.insert('Integrations', values, context.user.id);
    AuditService.write('INTEGRATION_SAVE', 'Integrations', saved.id, { name: values.name }, context.user.id);
    return toPublic(saved);
  }

  function remove(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var existing = SheetRepository.findById('Integrations', data && data.id);
    if (!existing) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบรายการ');
    SheetRepository.softDelete('Integrations', existing.id, existing.version, context.user.id);
    AuditService.write('INTEGRATION_DELETE', 'Integrations', existing.id, {}, context.user.id);
    return { deleted: true };
  }

  return { list: list, save: save, remove: remove, visibleFor: visibleFor, replacedModuleKeys: replacedModuleKeys };
})();
