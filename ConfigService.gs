var ConfigService = (function () {
  'use strict';

  function getRequiredProperty(propertyName) {
    var value = Tenant.props().getProperty(propertyName);
    if (!value) {
      var error = new Error('ยังไม่ได้กำหนด ' + propertyName);
      error.code = 'CONFIG_MISSING';
      throw error;
    }
    return value;
  }

  function getFilesFolder() {
    return DriveApp.getFolderById(getRequiredProperty('FILES_FOLDER_ID'));
  }

  return { getRequiredProperty: getRequiredProperty, getFilesFolder: getFilesFolder };
})();
