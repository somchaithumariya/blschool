var MasterDataService = (function () {
  'use strict';

  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function getTable(tableKey) {
    var table = APP_CONFIG.MASTER_TABLES[tableKey];
    if (!table) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบตารางข้อมูลหลักที่ระบุ');
    return table;
  }

  function viewPermission(table) { return table.kind === 'year' ? 'academicYear.view' : 'master.view'; }
  function editPermission(table) { return table.kind === 'year' ? 'academicYear.edit' : 'master.edit'; }

  function validate(table, values, existingRows, currentId) {
    var errors = {};
    var input = values || {};
    if (table.kind === 'year') {
      if (!/^\d{4}$/.test(String(input.year || '').trim())) errors.year = 'กรุณาระบุปีการศึกษา 4 หลัก เช่น 2569';
      if (['1', '2'].indexOf(String(input.term || '').trim()) === -1) errors.term = 'กรุณาเลือกภาคเรียน 1 หรือ 2';
      if (!DATE_PATTERN.test(String(input.startsAt || ''))) errors.startsAt = 'กรุณาระบุวันเริ่มต้น';
      if (!DATE_PATTERN.test(String(input.endsAt || ''))) errors.endsAt = 'กรุณาระบุวันสิ้นสุด';
      if (!errors.startsAt && !errors.endsAt && input.endsAt < input.startsAt) errors.endsAt = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น';
      if (!errors.year && !errors.term) {
        var duplicateTerm = (existingRows || []).some(function (row) {
          return String(row.id) !== String(currentId) && String(row.year) === String(input.year).trim() &&
            String(row.term) === String(input.term).trim();
        });
        if (duplicateTerm) errors.term = 'มีปีการศึกษาและภาคเรียนนี้อยู่แล้ว';
      }
      return errors;
    }
    var name = String(input.name || '').trim();
    if (!name) errors.name = 'กรุณากรอกข้อมูล';
    else if (name.length > 100) errors.name = 'ความยาวต้องไม่เกิน 100 ตัวอักษร';
    else if ((existingRows || []).some(function (row) {
      return String(row.id) !== String(currentId) && String(row.name).trim().toLowerCase() === name.toLowerCase();
    })) errors.name = 'มีรายการนี้อยู่แล้ว';
    return errors;
  }

  function pickFields(table, values) {
    if (table.kind === 'year') {
      return {
        year: String(values.year).trim(),
        term: String(values.term).trim(),
        startsAt: String(values.startsAt),
        endsAt: String(values.endsAt),
        isActive: values.isActive === true
      };
    }
    return { name: String(values.name).trim() };
  }

  function list(token, data) {
    var table = getTable(data && data.table);
    AuthService.requirePermission(token, viewPermission(table));
    return listTable(data.table, table);
  }

  // โหลดทุกตารางที่ผู้ใช้มีสิทธิ์ในคำขอเดียว เพื่อให้สลับแท็บได้ทันทีโดยไม่เรียกเซิร์ฟเวอร์ซ้ำ
  function listAll(token) {
    var context = AuthService.requireSession(token);
    var result = {};
    Object.keys(APP_CONFIG.MASTER_TABLES).forEach(function (tableKey) {
      var table = APP_CONFIG.MASTER_TABLES[tableKey];
      if (Core.hasPermission(context.permissions, viewPermission(table))) result[tableKey] = listTable(tableKey, table);
    });
    return { tables: result, canEdit: {
      master: Core.hasPermission(context.permissions, 'master.edit'),
      academicYear: Core.hasPermission(context.permissions, 'academicYear.edit')
    } };
  }

  function listTable(tableKey, table) {
    var rows = SheetRepository.all(table.sheet);
    if (table.kind === 'year') {
      rows.sort(function (a, b) { return String(b.year + b.term).localeCompare(String(a.year + a.term)); });
    } else {
      rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); });
    }
    return { table: tableKey, label: table.label, kind: table.kind, rows: rows.map(publicRow) };
  }

  function save(token, data) {
    var payload = data || {};
    var table = getTable(payload.table);
    var context = AuthService.requirePermission(token, editPermission(table));
    var existing = SheetRepository.all(table.sheet);
    var errors = validate(table, payload.values, existing, payload.id);
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var fields = pickFields(table, payload.values);
    var record;
    if (payload.id) {
      record = SheetRepository.update(table.sheet, payload.id, fields, payload.version, context.user.id);
    } else {
      record = SheetRepository.insert(table.sheet, fields, context.user.id);
    }
    if (table.kind === 'year' && fields.isActive) deactivateOthers(table, record.id, context.user.id);
    AuditService.write(payload.id ? 'MASTER_UPDATE' : 'MASTER_CREATE', table.sheet, record.id, { table: payload.table }, context.user.id);
    return publicRow(record);
  }

  function deactivateOthers(table, keepId, actorId) {
    SheetRepository.all(table.sheet).filter(function (row) {
      return String(row.id) !== String(keepId) && row.isActive === true;
    }).forEach(function (row) {
      SheetRepository.update(table.sheet, row.id, { isActive: false }, row.version, actorId);
    });
  }

  function remove(token, data) {
    var payload = data || {};
    var table = getTable(payload.table);
    var context = AuthService.requirePermission(token, editPermission(table));
    SheetRepository.softDelete(table.sheet, payload.id, payload.version, context.user.id);
    AuditService.write('MASTER_DELETE', table.sheet, payload.id, { table: payload.table }, context.user.id);
    return { id: payload.id };
  }

  function seedDefaults(actorId) {
    var seeded = 0;
    Object.keys(APP_CONFIG.DEFAULT_MASTER_DATA).forEach(function (tableKey) {
      var table = APP_CONFIG.MASTER_TABLES[tableKey];
      if (SheetRepository.all(table.sheet, { includeDeleted: true }).length > 0) return;
      APP_CONFIG.DEFAULT_MASTER_DATA[tableKey].forEach(function (name) {
        SheetRepository.insert(table.sheet, { name: name }, actorId);
        seeded += 1;
      });
    });
    return seeded;
  }

  function publicRow(row) {
    var copy = {};
    Object.keys(row).forEach(function (key) {
      var value = row[key];
      if (value instanceof Date) {
        value = key === 'startsAt' || key === 'endsAt'
          ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') : value.toISOString();
      }
      copy[key] = value;
    });
    return copy;
  }

  return { validate: validate, pickFields: pickFields, list: list, listAll: listAll, save: save, remove: remove,
    seedDefaults: seedDefaults, getTable: getTable };
})();
