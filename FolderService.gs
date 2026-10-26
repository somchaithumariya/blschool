var FolderService = (function () {
  'use strict';

  var PROPERTY_NAME = 'FOLDER_IDS';

  function readIds() {
    var raw = Tenant.props().getProperty(PROPERTY_NAME);
    try { return raw ? JSON.parse(raw) : {}; } catch (error) { return {}; }
  }

  function ensureFolders() {
    var root = ConfigService.getFilesFolder();
    var ids = readIds();
    var created = 0;
    APP_CONFIG.FOLDERS.forEach(function (definition) {
      if (ids[definition.key]) {
        try { DriveApp.getFolderById(ids[definition.key]); return; } catch (error) { /* สร้างใหม่ */ }
      }
      ids[definition.key] = root.createFolder(definition.name).getId();
      created += 1;
    });
    Tenant.props().setProperty(PROPERTY_NAME, JSON.stringify(ids));
    return { ok: true, total: APP_CONFIG.FOLDERS.length, created: created };
  }

  function getFolder(key) {
    var id = readIds()[key];
    if (!id) throw SheetRepository.serviceError('CONFIG_MISSING', 'ยังไม่ได้สร้างโฟลเดอร์ ' + key + ' กรุณารัน setupSystem()');
    return DriveApp.getFolderById(id);
  }

  return { ensureFolders: ensureFolders, getFolder: getFolder, readIds: readIds };
})();
