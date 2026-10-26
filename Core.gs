var Core = (function () {
  'use strict';

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function validateRequired(values, fields) {
    return fields.reduce(function (errors, field) {
      var value = values ? values[field] : null;
      if (value === null || value === undefined || String(value).trim() === '') {
        errors[field] = 'กรุณากรอกข้อมูล';
      }
      return errors;
    }, {});
  }

  function hasPermission(permissions, requiredPermission) {
    return Array.isArray(permissions) &&
      (permissions.indexOf('*') !== -1 || permissions.indexOf(requiredPermission) !== -1);
  }

  function paginate(items, page, pageSize) {
    var safeItems = Array.isArray(items) ? items.slice() : [];
    var safePageSize = Math.max(1, Number(pageSize) || 10);
    var pageCount = Math.max(1, Math.ceil(safeItems.length / safePageSize));
    var safePage = Math.min(pageCount, Math.max(1, Number(page) || 1));
    var start = (safePage - 1) * safePageSize;
    return {
      items: safeItems.slice(start, start + safePageSize),
      page: safePage,
      pageSize: safePageSize,
      total: safeItems.length,
      pageCount: pageCount
    };
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createRecord(values, actorId, idFactory) {
    var now = nowIso();
    return Object.assign({}, values, {
      id: (idFactory || Utilities.getUuid)(),
      createdAt: now,
      createdBy: actorId || 'system',
      updatedAt: now,
      updatedBy: actorId || 'system',
      version: 1,
      isDeleted: false
    });
  }

  function publicUser(user, roles, permissions) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      personnelId: user.personnelId || '',
      roles: roles || [],
      permissions: permissions || [],
      mustChangePassword: user.mustChangePassword === true
    };
  }

  function isSafeRoute(route) {
    return typeof route === 'string' && /^#\/[a-z0-9-]+$/.test(route);
  }

  function isEmptyObject(value) {
    return !value || Object.keys(value).length === 0;
  }

  return {
    normalizeUsername: normalizeUsername,
    validateRequired: validateRequired,
    hasPermission: hasPermission,
    paginate: paginate,
    nowIso: nowIso,
    createRecord: createRecord,
    publicUser: publicUser,
    isEmptyObject: isEmptyObject,
    isSafeRoute: isSafeRoute
  };
})();
