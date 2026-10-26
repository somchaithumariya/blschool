var SheetRepository = (function () {
  'use strict';

  // ทุกตารางยกเว้นตารางที่โตเร็ว จะเก็บไว้ใน CacheService ข้ามคำขอ (แบ่งเป็นชิ้นละ ~90KB)
  // และล้างทุกครั้งที่ระบบเขียนข้อมูล
  var SHARED_CACHE_TTL_SECONDS = 6 * 60 * 60;
  var CHUNK_SIZE = 90000;
  var MAX_CHUNKS = 40;
  // แคชเก็บได้ 100KB ต่อชิ้น (นับเป็นไบต์ อักษรไทย 1 ตัว = 3 ไบต์) ข้อความที่ยาวกว่านี้จึงบีบอัดเป็น gzip+base64 ก่อนแบ่งชิ้น
  var PLAIN_LIMIT = 20000;
  var PUT_GROUP_SIZE = 800000;
  // ตารางที่ถูกอ่านจากแคชหลังเก็บไว้นานกว่านี้ จะถูกเก็บซ้ำเพื่อต่ออายุ (ระบบที่มีคนใช้อยู่จึงไม่ต้องกลับไปอ่านชีต)
  var REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;

  function isSharedCached(sheetName) {
    var excluded = APP_CONFIG.NO_SHARED_CACHE_SHEETS || ['Sessions', 'AuditLogs'];
    return excluded.indexOf(sheetName) === -1;
  }

  // แคชภายในคำขอเดียว: เปิด spreadsheet ครั้งเดียว ตรวจ schema ครั้งเดียว และอ่านแต่ละตารางครั้งเดียว
  var memo = { spreadsheet: null, sheets: {}, rows: {}, tags: {} };
  var batch = null;

  function spreadsheetId() {
    if (memo.spreadsheetId) return memo.spreadsheetId;
    var id = Tenant.props().getProperty('DATABASE_SPREADSHEET_ID');
    if (!id) throw serviceError('CONFIG_MISSING', 'ยังไม่ได้กำหนด DATABASE_SPREADSHEET_ID');
    memo.spreadsheetId = id;
    return id;
  }

  function getSpreadsheet() {
    if (memo.spreadsheet) return memo.spreadsheet;
    memo.spreadsheet = SpreadsheetApp.openById(spreadsheetId());
    return memo.spreadsheet;
  }

  function getDefinition(sheetName) {
    var headers = APP_CONFIG.SHEETS[sheetName];
    if (!headers) throw serviceError('UNKNOWN_SHEET', 'ไม่พบตารางที่ระบุ');
    return headers;
  }

  function ensureSheet(sheetName) {
    var spreadsheet = getSpreadsheet();
    var headers = getDefinition(sheetName);
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
      try { if (sheet.getMaxColumns() > headers.length) sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length); } catch (error) { /* ไม่เป็นไร */ }
    }
    var width = sheet.getLastColumn();
    var existing = width ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
    while (existing.length && existing[existing.length - 1] === '') existing.pop();
    var hasData = sheet.getLastRow() > 1;
    var same = existing.length === headers.length && headers.every(function (header, index) { return existing[index] === header; });
    if (same) return sheet;
    if (!hasData) {
      if (width) sheet.getRange(1, 1, 1, width).clearContent();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return sheet;
    }
    // มีข้อมูลแล้ว: อนุญาตเฉพาะการเพิ่มคอลัมน์ต่อท้าย เพื่อไม่ให้ข้อมูลเดิมเลื่อนผิดคอลัมน์
    var isPrefix = existing.length < headers.length && existing.every(function (header, index) { return header === headers[index]; });
    if (!isPrefix) throw serviceError('SCHEMA_MISMATCH', 'โครงสร้างตาราง ' + sheetName + ' ไม่ตรงกับระบบ');
    sheet.getRange(1, existing.length + 1, 1, headers.length - existing.length).setValues([headers.slice(existing.length)]);
    return sheet;
  }

  function getExistingSheet(sheetName) {
    if (memo.sheets[sheetName]) return memo.sheets[sheetName];
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw serviceError('SCHEMA_MISSING', 'ไม่พบตาราง ' + sheetName + ' กรุณารัน setupSystem()');
    // ตรวจหัวตารางครั้งเดียวแล้วจำไว้ในแคช (ประหยัดการอ่านชีต 1 ครั้งต่อตารางต่อคำขอ)
    var verified = verifiedSchemas();
    if (verified.indexOf(sheetName) === -1) {
      assertSchema(sheetName, sheet);
      rememberSchema(sheetName, verified);
    }
    memo.sheets[sheetName] = sheet;
    return sheet;
  }

  function schemaKey() { return 'schema:ok:' + APP_CONFIG.SCHEMA_VERSION; }

  function verifiedSchemas() {
    if (memo.verified) return memo.verified;
    var cache = getSharedCache();
    try { memo.verified = cache ? JSON.parse(cache.get(schemaKey()) || '[]') : []; } catch (error) { memo.verified = []; }
    return memo.verified;
  }

  function rememberSchema(sheetName, verified) {
    verified.push(sheetName);
    var cache = getSharedCache();
    if (cache) { try { cache.put(schemaKey(), JSON.stringify(verified), SHARED_CACHE_TTL_SECONDS); } catch (error) { /* ignore */ } }
  }

  function assertSchema(sheetName, sheet) {
    var headers = getDefinition(sheetName);
    if (sheet.getLastColumn() !== headers.length || sheet.getLastRow() < 1) {
      throw serviceError('SCHEMA_MISMATCH', 'โครงสร้างตาราง ' + sheetName + ' ไม่ตรงกับระบบ');
    }
    var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (headers.some(function (header, index) { return existing[index] !== header; })) {
      throw serviceError('SCHEMA_MISMATCH', 'โครงสร้างตาราง ' + sheetName + ' ไม่ตรงกับระบบ');
    }
    return sheet;
  }

  // แปลงค่า Date จาก Sheets เป็นข้อความเสมอ เพื่อให้ข้อมูลจากชีตและจากแคชมีรูปแบบเดียวกัน
  function normalizeCell(value) {
    if (Object.prototype.toString.call(value) !== '[object Date]') return value;
    if (isNaN(value.getTime())) return '';
    var isDateOnly = value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0 && value.getMilliseconds() === 0;
    if (isDateOnly) {
      return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2) + '-' + ('0' + value.getDate()).slice(-2);
    }
    return value.toISOString();
  }

  function rowToObject(headers, values) {
    return headers.reduce(function (record, header, index) {
      record[header] = normalizeCell(values[index]);
      return record;
    }, {});
  }

  // ข้อความที่ดูเหมือนตัวเลข/วันที่ (เช่น 0812345678, 00123, 2026-05-16) ให้เก็บเป็นข้อความ
  // เพื่อไม่ให้ Sheets ตัดเลข 0 นำหน้า และข้อความที่ขึ้นต้นด้วย = + - @ จะไม่กลายเป็นสูตร
  function protectText(value) {
    if (typeof value !== 'string' || value === '') return value;
    if (/^[=+\-@]/.test(value) || /^[\d\s.\/:,]+$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) return "'" + value;
    return value;
  }

  function objectToRow(headers, record) {
    return headers.map(function (header) {
      var value = record[header];
      return value === undefined || value === null ? '' : protectText(value);
    });
  }

  function getSharedCache() {
    return Tenant.cache();
  }

  // ---------- รุ่นของแต่ละตาราง (เก็บถาวรใน Script Properties) ----------
  // ทุกครั้งที่ตารางถูกเขียน เลขรุ่นของตารางนั้นจะเพิ่มขึ้น แคชและผลสรุปที่ผูกกับรุ่นเก่าจึงใช้ไม่ได้ทันที
  // _era เปลี่ยนเมื่อสั่งล้างแคชทั้งหมด (เช่น หลังแก้ข้อมูลในชีตด้วยมือ) ทำให้ผลเก่าทุกชิ้นหมดอายุพร้อมกัน
  var VERSION_PROPERTY = 'TABLE_VERSIONS';
  var UNVERSIONED = ['Sessions', 'AuditLogs', 'Summaries'];

  function properties() { return Tenant.props(); }

  function newEra() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function readVersions() {
    var versions = {};
    try { versions = JSON.parse(properties().getProperty(VERSION_PROPERTY) || '{}') || {}; } catch (error) { versions = {}; }
    if (typeof versions !== 'object' || Array.isArray(versions)) versions = {};
    if (!versions._era) {
      versions._era = newEra();
      saveVersions(versions);
    }
    return versions;
  }

  // เก็บทั้งใน Script Properties (ค่าจริง) และแคช (อ่านเร็ว ไม่กินโควตาการอ่าน Properties ต่อวัน)
  var VERSION_CACHE_KEY = 'tv:v1';
  function saveVersions(versions) {
    try { properties().setProperty(VERSION_PROPERTY, JSON.stringify(versions)); } catch (error) { /* ใช้ค่าในคำขอนี้ไปก่อน */ }
    var cache = getSharedCache();
    if (cache) { try { cache.put(VERSION_CACHE_KEY, JSON.stringify(versions), 21600); } catch (error) { /* ignore */ } }
  }

  function tableVersions() {
    if (memo.versions) return memo.versions;
    var cache = getSharedCache();
    if (cache) {
      try {
        var hit = JSON.parse(cache.get(VERSION_CACHE_KEY) || 'null');
        if (hit && hit._era) { memo.versions = hit; return hit; }
      } catch (error) { /* อ่านจาก Properties */ }
    }
    memo.versions = readVersions();
    if (cache) { try { cache.put(VERSION_CACHE_KEY, JSON.stringify(memo.versions), 21600); } catch (error) { /* ignore */ } }
    return memo.versions;
  }

  function versionTag(sheetName) {
    var versions = tableVersions();
    return versions._era + '.' + (Number(versions[sheetName]) || 0);
  }

  // เรียกภายใต้ script lock เสมอ (insert/update/replace) จึงอ่าน-แก้-เขียนได้ปลอดภัย
  function bumpVersion(sheetName, current) {
    if (UNVERSIONED.indexOf(sheetName) !== -1) return;
    var versions = current || latestVersions();
    versions[sheetName] = (Number(versions[sheetName]) || 0) + 1;
    versions._all = (Number(versions._all) || 0) + 1;
    saveVersions(versions);
    memo.versions = versions;
  }

  // แคชตารางผูกกับเลขรุ่น: ข้อมูลที่อ่านมาก่อนมีการเขียน จะถูกเก็บในชื่อรุ่นเก่า ไม่มีใครอ่านซ้ำ
  function sharedKey(sheetName) {
    return UNVERSIONED.indexOf(sheetName) === -1 ? 'tbl:v4:' + sheetName + ':' + versionTag(sheetName) : 'tbl:v4:' + sheetName;
  }

  // ---------- เก็บข้อความยาวลงแคชแบบแบ่งชิ้น ----------
  // j = ข้อความล้วน (สั้น), z = gzip+base64 (ยาว: เล็กลงหลายเท่า อ่าน/เขียนแคชเร็วขึ้น และไม่เกิน 100KB ต่อชิ้นแม้เป็นอักษรไทย)
  function pack(raw) {
    if (raw.length <= PLAIN_LIMIT) return 'j' + raw;
    try {
      return 'z' + Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw, 'application/json')).getBytes());
    } catch (error) { return null; }
  }

  function unpack(text) {
    var kind = text.charAt(0);
    if (kind === 'j') return text.slice(1);
    if (kind !== 'z') throw new Error('unknown cache format');
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(text.slice(1)), 'application/x-gzip')).getDataAsString();
  }

  // คืนรายการ [key, value] เรียงชิ้นข้อมูลก่อน แล้วปิดท้ายด้วยตัวนับ (ผู้อ่านเห็นตัวนับเมื่อชิ้นข้อมูลครบแล้วเท่านั้น)
  function chunkEntries(base, raw) {
    var text = pack(raw);
    if (text === null) return null;
    var count = Math.ceil(text.length / CHUNK_SIZE) || 1;
    if (count > MAX_CHUNKS) return null;
    var entries = [];
    for (var index = 0; index < count; index += 1) entries.push([base + ':' + index, text.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)]);
    entries.push([base, count + '|' + Date.now()]);
    return entries;
  }

  // เขียนหลายรายการด้วย putAll ให้น้อยครั้งที่สุด (ครั้งละไม่เกิน ~800KB)
  function putEntries(cache, entries, ttl) {
    var group = {};
    var size = 0;
    var pending = 0;
    entries.forEach(function (entry) {
      if (pending && size + entry[1].length > PUT_GROUP_SIZE) { cache.putAll(group, ttl); group = {}; size = 0; pending = 0; }
      group[entry[0]] = entry[1];
      size += entry[1].length;
      pending += 1;
    });
    if (pending) cache.putAll(group, ttl);
  }

  // อ่านข้อความที่เก็บแบบแบ่งชิ้น คืน { raw, stamp } หรือ null เมื่อไม่มี/ไม่ครบ
  function readChunked(cache, base) {
    var head = String(cache.get(base) || '').split('|');
    var count = Number(head[0]);
    if (!count) return null;
    var keys = [];
    for (var index = 0; index < count; index += 1) keys.push(base + ':' + index);
    var parts = cache.getAll(keys);
    var text = '';
    for (var part = 0; part < keys.length; part += 1) {
      if (typeof parts[keys[part]] !== 'string') return null;
      text += parts[keys[part]];
    }
    return { raw: unpack(text), stamp: Number(head[1]) || 0 };
  }

  function writeChunked(cache, base, raw, ttl) {
    var entries = chunkEntries(base, raw);
    if (entries) putEntries(cache, entries, ttl);
  }

  function readSharedCache(sheetName) {
    if (!isSharedCached(sheetName)) return null;
    var cache = getSharedCache();
    if (!cache) return null;
    try {
      var hit = readChunked(cache, sharedKey(sheetName));
      if (!hit) return null;
      var records = JSON.parse(hit.raw);
      if (Date.now() - hit.stamp > REFRESH_AFTER_MS) {
        try { writeChunked(cache, sharedKey(sheetName), hit.raw, SHARED_CACHE_TTL_SECONDS); } catch (error) { /* ต่ออายุไม่ได้ ไม่เป็นไร */ }
      }
      return records;
    } catch (error) { return null; }
  }

  function writeSharedCache(sheetName, records) {
    if (!isSharedCached(sheetName)) return;
    var cache = getSharedCache();
    if (!cache) return;
    try { writeChunked(cache, sharedKey(sheetName), JSON.stringify(records), SHARED_CACHE_TTL_SECONDS); } catch (error) { /* แคชเป็นเพียงตัวเร่ง ไม่ให้กระทบการทำงานหลัก */ }
  }

  // ตารางที่กำหนดสิทธิ์: เมื่อแก้ไข ให้เลื่อนรุ่นของแคชบริบทผู้ใช้ (ดู AuthService.requireSession)
  var ACCESS_SHEETS = ['Users', 'UserRoles', 'Roles', 'RolePermissions', 'Permissions'];

  // patch(rows) = ปรับข้อมูลที่อ่านไว้แล้วให้ตรงกับที่เพิ่งเขียน แล้วเก็บเป็นแคชรุ่นใหม่ทันที
  // (คนถัดไปที่เปิดหน้านี้ไม่ต้องอ่านชีตใหม่) ทำเฉพาะเมื่อข้อมูลที่ถืออยู่ยังเป็นรุ่นล่าสุดตอนเขียน
  // ส่งข้อมูลที่เขียนค้างไว้ลงชีตจริงทันที: Apps Script รวบการเขียนไว้ส่งทีหลัง ถ้าเลื่อนรุ่นก่อน
  // คำขออื่น (เช่น ผู้ใช้คนอื่นที่กำลังโหลดสิทธิ์) จะอ่านชีตที่ยังเป็นข้อมูลเก่า แล้วเก็บลงแคชในชื่อรุ่นใหม่ค้างไว้ 6 ชั่วโมง
  function flushWrites() {
    try { if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) SpreadsheetApp.flush(); } catch (error) { /* ignore */ }
  }

  // รุ่นล่าสุดที่รู้: รวม Script Properties กับแคช (เอาค่ามากกว่า) กันเลขรุ่นซ้ำเมื่อบันทึก Properties ไม่สำเร็จ
  function latestVersions() {
    var versions = readVersions();
    var cache = getSharedCache();
    if (!cache) return versions;
    try {
      var hit = JSON.parse(cache.get(VERSION_CACHE_KEY) || 'null');
      if (hit && hit._era === versions._era) {
        Object.keys(hit).forEach(function (key) {
          if (key !== '_era' && (Number(hit[key]) || 0) > (Number(versions[key]) || 0)) versions[key] = hit[key];
        });
      }
    } catch (error) { /* ใช้ค่าจาก Properties */ }
    return versions;
  }

  function invalidate(sheetName, patch) {
    flushWrites();
    var held = memo.rows[sheetName];
    var heldTag = memo.tags[sheetName];
    delete memo.rows[sheetName];
    delete memo.tags[sheetName];
    var cache = getSharedCache();
    var versioned = UNVERSIONED.indexOf(sheetName) === -1;
    var before = versioned ? latestVersions() : null;
    var beforeTag = before ? before._era + '.' + (Number(before[sheetName]) || 0) : '';
    // ลบแคชรุ่นปัจจุบันก่อน แล้วค่อยเลื่อนเลขรุ่น (Sessions/AuditLogs/Summaries ไม่มีผลต่อผลลัพธ์อื่น จึงไม่เลื่อนรุ่น)
    if (cache && isSharedCached(sheetName)) { try { cache.remove(sharedKey(sheetName)); } catch (error) { /* ignore */ } }
    bumpVersion(sheetName, before);
    if (patch && held && versioned && heldTag === beforeTag && isSharedCached(sheetName)) {
      try {
        patch(held);
        memo.rows[sheetName] = held;
        memo.tags[sheetName] = versionTag(sheetName);
        writeSharedCache(sheetName, held);
      } catch (error) { delete memo.rows[sheetName]; delete memo.tags[sheetName]; }
    }
    if (ACCESS_SHEETS.indexOf(sheetName) !== -1 && cache) {
      try { cache.put('auth:epoch', String(Date.now()) + Math.floor(Math.random() * 1000), 21600); } catch (error) { /* ignore */ }
    }
  }

  // ---------- ผลลัพธ์ที่คำนวณแล้ว (ใช้ร่วมกันทุกผู้ใช้) ----------
  // options.deps = ตารางที่ใช้คำนวณ: ผลใช้ได้จนกว่าตารางเหล่านั้นถูกเขียน (ไม่ระบุ = จนกว่าตารางใดก็ตามถูกเขียน)
  // options.stamp = ค่าอื่นที่ผลขึ้นอยู่ด้วย เช่น วันที่วันนี้
  // options.persist = ชื่อผลสรุปที่เก็บลงชีต Summaries ด้วย (ยังอยู่แม้แคชถูกล้าง ไม่ต้องคำนวณจากหลายตารางใหม่)
  var RESULT_TTL_SECONDS = 6 * 60 * 60;
  var SUMMARY_CHUNK = 45000;
  var SUMMARY_MAX_CHUNKS = 20;
  var SUMMARY_WRITE_GAP_SECONDS = 600;

  function signatureOf(options) {
    var versions = tableVersions();
    var parts = [versions._era];
    if (options.stamp !== undefined && options.stamp !== null) parts.push(String(options.stamp));
    if (options.deps && options.deps.length) {
      options.deps.forEach(function (sheetName) { parts.push(sheetName + '.' + (Number(versions[sheetName]) || 0)); });
    } else parts.push('all.' + (Number(versions._all) || 0));
    return parts.join('|');
  }

  function shortHash(text) {
    try {
      var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
      return bytes.slice(0, 12).map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
    } catch (error) { return String(text).length + '-' + String(text).slice(-80); }
  }

  function memoResult(key, compute, options) {
    options = options || {};
    var cache = getSharedCache();
    var signature = signatureOf(options);
    var base = 'rs2:' + key + ':' + shortHash(signature);
    if (cache) {
      try { var hit = readChunked(cache, base); if (hit !== null) return JSON.parse(hit.raw); } catch (error) { /* คำนวณใหม่ */ }
    }
    var family = options.persist ? String(options.persist === true ? key : options.persist) : '';
    if (family) {
      var stored = readSummary(family, signature);
      if (stored !== null) {
        try {
          var parsed = JSON.parse(stored);
          if (cache) writeChunked(cache, base, stored, RESULT_TTL_SECONDS);
          return parsed;
        } catch (error) { /* คำนวณใหม่ */ }
      }
    }
    var value = compute();
    var text = null;
    try { text = JSON.stringify(value); } catch (error) { text = null; }
    if (text !== null && cache) { try { writeChunked(cache, base, text, RESULT_TTL_SECONDS); } catch (error) { /* ไม่ให้แคชกระทบการทำงานหลัก */ } }
    if (text !== null && family) writeSummary(family, signature, text);
    return value;
  }

  // ---------- ตารางสรุปผลสำเร็จรูป (ชีต Summaries) ----------
  // 1 ผลสรุป = 1 แถวขึ้นไป (แบ่งชิ้นละไม่เกิน 45,000 ตัวอักษร เพราะ 1 ช่องใน Google Sheets เก็บได้ 50,000)
  function summarySheet() {
    if (!APP_CONFIG.SHEETS.Summaries) return null;
    try { return getExistingSheet('Summaries'); } catch (error) { return null; }
  }

  function summaryMatches(sheet, family) {
    var headers = getDefinition('Summaries');
    if (sheet.getLastRow() < 2) return [];
    var column = headers.indexOf('key') + 1;
    return sheet.getRange(2, column, sheet.getLastRow() - 1, 1).createTextFinder(family).matchEntireCell(true).findAll()
      .map(function (cell) { return cell.getRow(); });
  }

  function readSummary(family, signature) {
    try {
      var sheet = summarySheet();
      if (!sheet) return null;
      var headers = getDefinition('Summaries');
      var rows = summaryMatches(sheet, family).map(function (rowNumber) {
        return rowToObject(headers, sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]);
      }).filter(function (row) { return row.signature === signature && row.isDeleted !== true; })
        .sort(function (a, b) { return Number(a.part) - Number(b.part); });
      if (!rows.length || rows.length !== Number(rows[0].parts)) return null;
      return rows.map(function (row) { return String(row.data); }).join('');
    } catch (error) { return null; }
  }

  function writeSummary(family, signature, text) {
    var cache = getSharedCache();
    var gapKey = 'sumw:' + family;
    // ข้อมูลที่เปลี่ยนบ่อย (เช่น เช็กชื่อ) ไม่ต้องเขียนชีตทุกครั้ง แคชยังใช้ได้ตามปกติ
    try { if (cache && cache.get(gapKey)) return; } catch (error) { /* ignore */ }
    var count = Math.ceil(text.length / SUMMARY_CHUNK) || 1;
    if (count > SUMMARY_MAX_CHUNKS) return;
    try {
      withLock(function () {
        var sheet = summarySheet();
        if (!sheet) return;
        var headers = getDefinition('Summaries');
        var existing = summaryMatches(sheet, family);
        var values = [];
        for (var part = 0; part < count; part += 1) {
          values.push(objectToRow(headers, Core.createRecord({ key: family, signature: signature, part: part, parts: count,
            data: text.slice(part * SUMMARY_CHUNK, (part + 1) * SUMMARY_CHUNK) }, 'system')));
        }
        var contiguous = existing.length === count && existing.every(function (row, index) { return row === existing[0] + index; });
        if (contiguous) sheet.getRange(existing[0], 1, count, headers.length).setValues(values);
        else {
          existing.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
          sheet.getRange(sheet.getLastRow() + 1, 1, count, headers.length).setValues(values);
        }
      });
      if (cache) cache.put(gapKey, '1', SUMMARY_WRITE_GAP_SECONDS);
    } catch (error) { /* ผลสรุปเป็นเพียงตัวเร่ง */ }
  }

  // รายการผลสรุปที่เก็บไว้ (ใช้ในหน้าศูนย์ผู้ดูแลระบบ)
  function summaryInfo() {
    var sheet = summarySheet();
    if (!sheet || sheet.getLastRow() < 2) return [];
    var headers = getDefinition('Summaries');
    var width = headers.indexOf('parts') + 1;
    var slice = headers.slice(0, width);
    var byKey = {};
    sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().forEach(function (values) {
      var row = rowToObject(slice, values);
      if (!row.key) return;
      var item = byKey[row.key] || (byKey[row.key] = { key: row.key, rows: 0, updatedAt: '' });
      item.rows += 1;
      if (String(row.createdAt) > item.updatedAt) item.updatedAt = String(row.createdAt);
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; });
  }

  // ---------- อ่านหลายตารางในครั้งเดียว (Sheets API batchGet) ----------
  // การอ่านชีตทีละตารางใช้เวลาตารางละราวครึ่งวินาที คำขอแรกหลังแคชหมดอายุจึงช้ามาก (หลายสิบตาราง)
  // เมื่อตารางใดไม่อยู่ในแคช จึงอ่านตารางนั้นพร้อมตารางอื่นที่ยังไม่อยู่ในแคชทั้งหมดในการเรียกครั้งเดียว แล้วเก็บลงแคช
  // ถ้าใช้ Sheets API ไม่ได้ (ยังไม่เปิดบริการ/เรียกไม่สำเร็จ) จะกลับไปอ่านทีละตารางแบบเดิมโดยอัตโนมัติ
  var BULK_OFF_KEY = 'bulk:off';
  var BULK_OK_KEY = 'bulk:ok';
  var BULK_SKIP_KEY = 'bulk:skip';
  // ตารางที่ตรวจแล้วพบว่าอ่านทางนี้ได้ค่าไม่ตรงกับ SpreadsheetApp (เช่น มีเซลล์วันที่ที่พิมพ์เองในชีต) จะอ่านแบบเดิมเสมอ
  var BULK_SKIP_PROPERTY = 'BULK_SKIP_SHEETS';
  var BULK_CHECKED_PROPERTY = 'BULK_CHECKED';

  function tagOf(sheetName) { return UNVERSIONED.indexOf(sheetName) === -1 ? versionTag(sheetName) : ''; }

  function bulkAvailable() {
    if (memo.bulkOff || batch) return false;
    if (typeof Tenant !== 'undefined' && Tenant.isExclusive()) return false;
    return typeof Sheets !== 'undefined' && !!Sheets && !!Sheets.Spreadsheets && !!Sheets.Spreadsheets.Values;
  }

  function rangeName(sheetName) { return "'" + String(sheetName).replace(/'/g, "''") + "'"; }

  // แปลงผลจาก API (ตัดช่องว่างท้ายแถวออก) เป็นระเบียน คืน null เมื่อหัวตารางไม่ตรงกับระบบ (ให้ทางเดิมตรวจและแจ้งข้อผิดพลาด)
  function recordsFromValues(sheetName, values) {
    var headers = getDefinition(sheetName);
    var head = (values[0] || []).slice();
    while (head.length && head[head.length - 1] === '') head.pop();
    if (head.length !== headers.length) return null;
    for (var column = 0; column < headers.length; column += 1) if (head[column] !== headers[column]) return null;
    var overflow = false;
    var records = values.slice(1).map(function (row) {
      row = row || [];
      if (row.length > headers.length) overflow = true;
      var record = {};
      for (var cell = 0; cell < headers.length; cell += 1) record[headers[cell]] = row[cell] === undefined || row[cell] === null ? '' : row[cell];
      return record;
    });
    return overflow ? null : records;
  }

  function fetchRanges(names) {
    var ranges = Sheets.Spreadsheets.Values.batchGet(spreadsheetId(), { ranges: names.map(rangeName),
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' }).valueRanges || [];
    if (ranges.length !== names.length) throw new Error('จำนวนตารางที่ได้ไม่ครบ');
    return ranges;
  }

  // ทำครั้งเดียวต่อคำขอ: ดูว่าตารางใดยังไม่อยู่ในแคช (โหลดพ่วงไปด้วย) และตารางใดถูกกันไว้ไม่ให้อ่านทางนี้
  function bulkCompanions(sheetName) {
    var cache = getSharedCache();
    var excluded = APP_CONFIG.BULK_EXCLUDE_SHEETS || [];
    var others = Object.keys(APP_CONFIG.SHEETS).filter(function (name) {
      return name !== sheetName && isSharedCached(name) && excluded.indexOf(name) === -1 && !memo.rows[name];
    });
    var present = {};
    if (cache) { try { present = cache.getAll(others.map(sharedKey).concat([BULK_OFF_KEY, BULK_SKIP_KEY])); } catch (error) { present = {}; } }
    if (present[BULK_OFF_KEY]) memo.bulkOff = true;
    var skip = null;
    try { if (present[BULK_SKIP_KEY]) skip = JSON.parse(present[BULK_SKIP_KEY]); } catch (error) { skip = null; }
    if (!Array.isArray(skip)) {
      try { skip = JSON.parse(properties().getProperty(BULK_SKIP_PROPERTY) || '[]'); } catch (error) { skip = []; }
      if (!Array.isArray(skip)) skip = [];
      if (cache) { try { cache.put(BULK_SKIP_KEY, JSON.stringify(skip), SHARED_CACHE_TTL_SECONDS); } catch (error) { /* ignore */ } }
    }
    memo.bulkSkip = skip;
    return others.filter(function (name) { return !present[sharedKey(name)]; });
  }

  function bulkLoad(sheetName) {
    // ใช้เฉพาะตารางที่เก็บในแคช (เรียก API เมื่อแคชว่างเท่านั้น) ตารางที่อ่านสดทุกครั้งยังอ่านผ่าน SpreadsheetApp
    // เพื่อไม่ให้กินโควตา Sheets API (60 ครั้ง/นาที) เมื่อมีผู้ใช้พร้อมกันจำนวนมาก
    if (!bulkAvailable() || !isSharedCached(sheetName)) return;
    var cache = getSharedCache();
    var names = [sheetName];
    if (!memo.bulkSkip) names = names.concat(bulkCompanions(sheetName));
    if (memo.bulkOff) return;
    names = names.filter(function (name) { return memo.bulkSkip.indexOf(name) === -1; });
    if (!names.length) return;
    var ranges;
    try {
      // ข้อมูลที่คำขอนี้เพิ่งเขียนผ่าน SpreadsheetApp ต้องลงชีตจริงก่อน API จึงจะเห็น
      if (memo.spreadsheet) flushWrites();
      ranges = fetchRanges(names);
    } catch (error) {
      memo.bulkOff = true;
      if (cache) { try { cache.put(BULK_OFF_KEY, String(error && error.message || error).slice(0, 300), 120); } catch (ignored) { /* ignore */ } }
      return;
    }
    var entries = [];
    var verified = verifiedSchemas();
    var learned = false;
    names.forEach(function (name, index) {
      var records = recordsFromValues(name, ranges[index].values || []);
      if (!records) return;
      memo.rows[name] = records;
      memo.tags[name] = tagOf(name);
      if (verified.indexOf(name) === -1) { verified.push(name); learned = true; }
      if (!isSharedCached(name)) return;
      var chunks = chunkEntries(sharedKey(name), JSON.stringify(records));
      if (chunks) entries = entries.concat(chunks);
    });
    if (!cache) return;
    if (learned) entries.push([schemaKey(), JSON.stringify(verified)]);
    if (!memo.bulkSeen) { memo.bulkSeen = true; entries.push([BULK_OK_KEY, String(Date.now())]); }
    try { putEntries(cache, entries, SHARED_CACHE_TTL_SECONDS); } catch (error) { /* แคชเป็นเพียงตัวเร่ง */ }
  }

  // อ่านทั้งตารางจากชีตด้วยการเรียกครั้งเดียว (รวมหัวตารางเพื่อตรวจโครงสร้างไปพร้อมกัน)
  function readSheetRows(sheetName) {
    var headers = getDefinition(sheetName);
    var verified = verifiedSchemas();
    if (verified.indexOf(sheetName) !== -1) {
      var known = getExistingSheet(sheetName);
      var lastRow = known.getLastRow();
      return lastRow < 2 ? [] : known.getRange(2, 1, lastRow - 1, headers.length).getValues()
        .map(function (row) { return rowToObject(headers, row); });
    }
    var sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw serviceError('SCHEMA_MISSING', 'ไม่พบตาราง ' + sheetName + ' กรุณารัน setupSystem()');
    var values = sheet.getDataRange().getValues();
    var head = values[0] || [];
    if (head.length !== headers.length || headers.some(function (header, index) { return head[index] !== header; })) {
      throw serviceError('SCHEMA_MISMATCH', 'โครงสร้างตาราง ' + sheetName + ' ไม่ตรงกับระบบ');
    }
    rememberSchema(sheetName, verified);
    memo.sheets[sheetName] = sheet;
    return values.slice(1).map(function (row) { return rowToObject(headers, row); });
  }

  function loadRows(sheetName) {
    if (memo.rows[sheetName]) return memo.rows[sheetName];
    var cached = readSharedCache(sheetName);
    if (cached) {
      memo.rows[sheetName] = cached;
      memo.tags[sheetName] = tagOf(sheetName);
      return cached;
    }
    bulkLoad(sheetName);
    if (memo.rows[sheetName]) return memo.rows[sheetName];
    var records = readSheetRows(sheetName);
    memo.rows[sheetName] = records;
    memo.tags[sheetName] = tagOf(sheetName);
    writeSharedCache(sheetName, records);
    return records;
  }

  // สถานะการอ่านแบบครั้งเดียวหลายตาราง (แสดงในศูนย์ผู้ดูแลระบบ)
  function bulkStatus() {
    var cache = getSharedCache();
    var state = {};
    if (cache) { try { state = cache.getAll([BULK_OFF_KEY, BULK_OK_KEY]); } catch (error) { state = {}; } }
    var supported = typeof Sheets !== 'undefined' && !!Sheets && !!Sheets.Spreadsheets;
    var skip = [];
    var checked = null;
    try { skip = JSON.parse(properties().getProperty(BULK_SKIP_PROPERTY) || '[]') || []; } catch (error) { skip = []; }
    try { checked = JSON.parse(properties().getProperty(BULK_CHECKED_PROPERTY) || 'null'); } catch (error) { checked = null; }
    return { supported: supported, error: state[BULK_OFF_KEY] || '', lastUsed: Number(state[BULK_OK_KEY]) || 0, skipped: skip, checked: checked };
  }

  // เทียบผลการอ่านทางเร็ว (Sheets API) กับทางเดิม (SpreadsheetApp) ทุกตาราง ตารางที่ไม่ตรงกันจะถูกกันไว้ให้อ่านทางเดิม
  function bulkVerify() {
    if (typeof Sheets === 'undefined' || !Sheets || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
      return { supported: false, checked: 0, mismatched: [], error: 'โปรเจกต์ยังไม่ได้เปิดบริการ Google Sheets API' };
    }
    var names = Object.keys(APP_CONFIG.SHEETS).filter(function (name) { return UNVERSIONED.indexOf(name) === -1; });
    var spreadsheet = getSpreadsheet();
    var mismatched = [];
    var checked = 0;
    var viaApi = function (name) { var records = recordsFromValues(name, fetchRanges([name])[0].values || []); return records ? JSON.stringify(records) : null; };
    var viaSheet = function (name) {
      var headers = getDefinition(name);
      var sheet = spreadsheet.getSheetByName(name);
      if (!sheet) return null;
      var values = sheet.getDataRange().getValues();
      if ((values[0] || []).length !== headers.length) return null;
      return JSON.stringify(values.slice(1).map(function (row) { return rowToObject(headers, row); }));
    };
    try {
      flushWrites();
      for (var offset = 0; offset < names.length; offset += 20) {
        var group = names.slice(offset, offset + 20);
        var ranges = fetchRanges(group);
        group.forEach(function (name, index) {
          var direct = viaSheet(name);
          if (direct === null) return;
          checked += 1;
          var records = recordsFromValues(name, ranges[index].values || []);
          if (records && JSON.stringify(records) === direct) return;
          // อาจมีคนบันทึกข้อมูลระหว่างการอ่านสองทาง: อ่านซ้ำอีกครั้งก่อนสรุปว่าไม่ตรง
          if (viaApi(name) !== viaSheet(name)) mismatched.push(name);
        });
      }
    } catch (error) {
      return { supported: true, checked: checked, mismatched: mismatched, error: String(error && error.message || error).slice(0, 300) };
    }
    try {
      properties().setProperty(BULK_SKIP_PROPERTY, JSON.stringify(mismatched));
      properties().setProperty(BULK_CHECKED_PROPERTY, JSON.stringify({ at: Core.nowIso(), checked: checked, mismatched: mismatched.length }));
    } catch (error) { /* ignore */ }
    var cache = getSharedCache();
    if (cache) { try { cache.put(BULK_SKIP_KEY, JSON.stringify(mismatched), SHARED_CACHE_TTL_SECONDS); cache.remove(BULK_OFF_KEY); } catch (error) { /* ignore */ } }
    memo.bulkSkip = mismatched;
    // ทิ้งแคชของตารางที่ไม่ตรง (อาจเก็บค่าที่อ่านทางเร็วไว้) ให้คำขอถัดไปอ่านทางเดิม
    if (mismatched.length) { try { withLock(function () { mismatched.forEach(function (name) { invalidate(name); }); }); } catch (error) { /* ignore */ } }
    return { supported: true, checked: checked, mismatched: mismatched, error: '' };
  }

  function all(sheetName, options) {
    getDefinition(sheetName);
    var includeDeleted = options && options.includeDeleted;
    return loadRows(sheetName)
      .filter(function (record) { return includeDeleted || record.isDeleted !== true; })
      .map(function (record) { return Object.assign({}, record); });
  }

  function find(sheetName, predicate, options) {
    return all(sheetName, options).filter(predicate);
  }

  function findById(sheetName, id, options) {
    return find(sheetName, function (record) { return String(record.id) === String(id); }, options)[0] || null;
  }

  function insert(sheetName, values, actorId) {
    var record = Core.createRecord(values, actorId);
    if (batch) {
      getExistingSheet(sheetName);
      loadRows(sheetName).push(Object.assign({}, record));
      (batch[sheetName] = batch[sheetName] || []).push(record);
      return record;
    }
    return withLock(function () {
      var sheet = getExistingSheet(sheetName);
      sheet.appendRow(objectToRow(getDefinition(sheetName), record));
      invalidate(sheetName, function (rows) { rows.push(Object.assign({}, record)); });
      return record;
    });
  }

  function insertMany(sheetName, valuesList, actorId) {
    if (!valuesList || valuesList.length === 0) return [];
    var headers = getDefinition(sheetName);
    var records = valuesList.map(function (values) { return Core.createRecord(values, actorId); });
    return withLock(function () {
      var sheet = getExistingSheet(sheetName);
      sheet.getRange(sheet.getLastRow() + 1, 1, records.length, headers.length)
        .setValues(records.map(function (record) { return objectToRow(headers, record); }));
      invalidate(sheetName);
      return records;
    });
  }

  // รวมการ insert หลายแถวแล้วเขียนครั้งเดียวต่อตาราง ใช้กับงาน seed/นำเข้าข้อมูล
  function runBatch(callback) {
    if (batch) return callback();
    batch = {};
    var pending;
    try {
      var result = callback();
      pending = batch;
      batch = null;
      withLock(function () {
        Object.keys(pending).forEach(function (sheetName) {
          var headers = getDefinition(sheetName);
          var sheet = getExistingSheet(sheetName);
          var rows = pending[sheetName].map(function (record) { return objectToRow(headers, record); });
          sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
          invalidate(sheetName);
        });
      });
      return result;
    } catch (error) {
      if (batch || pending) Object.keys(batch || pending).forEach(function (sheetName) { invalidate(sheetName); });
      batch = null;
      throw error;
    }
  }

  // อ่านเฉพาะคอลัมน์ต้น ๆ ของตาราง (ไม่ต้องโหลดคอลัมน์ JSON ขนาดใหญ่ที่อยู่ท้ายตาราง)
  function readColumns(sheetName, fieldNames) {
    var sheet = getExistingSheet(sheetName);
    var headers = getDefinition(sheetName);
    var wanted = fieldNames.concat(['id', 'isDeleted']);
    var width = Math.max.apply(null, wanted.map(function (field) { return headers.indexOf(field) + 1; }));
    if (sheet.getLastRow() < 2) return [];
    var slice = headers.slice(0, width);
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
      .map(function (row) { return rowToObject(slice, row); })
      .filter(function (record) { return record.isDeleted !== true; });
  }

  // ค้นแถวด้วยค่าในคอลัมน์เดียวโดยใช้ TextFinder (เร็วกว่าการอ่านทั้งตาราง)
  function findByField(sheetName, fieldName, value) {
    var sheet = getExistingSheet(sheetName);
    var headers = getDefinition(sheetName);
    var column = headers.indexOf(fieldName) + 1;
    if (!column) throw serviceError('UNKNOWN_FIELD', 'ไม่พบคอลัมน์ ' + fieldName);
    if (sheet.getLastRow() < 2) return [];
    var matches = sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(value)).matchEntireCell(true).findAll();
    return matches.map(function (cell) {
      return rowToObject(headers, sheet.getRange(cell.getRow(), 1, 1, headers.length).getValues()[0]);
    }).filter(function (record) { return record.isDeleted !== true; });
  }

  // อ่านเฉพาะ n แถวล่าสุด (ใช้กับบันทึกการใช้งาน)
  function readLastRows(sheetName, count) {
    var sheet = getExistingSheet(sheetName);
    var headers = getDefinition(sheetName);
    var last = sheet.getLastRow();
    if (last < 2) return [];
    var start = Math.max(2, last - count + 1);
    return sheet.getRange(start, 1, last - start + 1, headers.length).getValues()
      .map(function (row) { return rowToObject(headers, row); }).reverse();
  }

  function update(sheetName, id, changes, expectedVersion, actorId) {
    return withLock(function () {
      var sheet = getExistingSheet(sheetName);
      var headers = getDefinition(sheetName);
      var idColumn = headers.indexOf('id') + 1;
      var match = sheet.getRange(2, idColumn, Math.max(1, sheet.getLastRow() - 1), 1)
        .createTextFinder(String(id)).matchEntireCell(true).findNext();
      if (!match) throw serviceError('NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการแก้ไข');
      var rowNumber = match.getRow();
      var current = rowToObject(headers, sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]);
      if (Number(current.version) !== Number(expectedVersion)) {
        throw serviceError('VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
      }
      var next = Object.assign({}, current, changes, {
        id: current.id,
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        updatedAt: Core.nowIso(),
        updatedBy: actorId,
        version: Number(current.version) + 1
      });
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([objectToRow(headers, next)]);
      invalidate(sheetName, function (rows) {
        for (var index = 0; index < rows.length; index += 1) {
          if (String(rows[index].id) === String(next.id)) { rows[index] = Object.assign({}, next); return; }
        }
        throw new Error("row not in cache");
      });
      return next;
    });
  }

  function softDelete(sheetName, id, expectedVersion, actorId) {
    return update(sheetName, id, { isDeleted: true }, expectedVersion, actorId);
  }

  function withLock(callback) {
    // ระหว่างติดตั้งโรงเรียนใหม่ ไม่มีใครเข้าถึงฐานข้อมูลนั้นได้ จึงไม่ต้องล็อก (ไม่ให้โรงเรียนอื่นต้องรอ)
    if (typeof Tenant !== 'undefined' && Tenant.isExclusive()) return callback();
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return callback(); } finally { flushWrites(); lock.releaseLock(); }
  }

  function replaceTablesAtomically(replacements, expectedVersions) {
    return withLock(function () {
      var sheetNames = Object.keys(replacements);
      var snapshots = {};
      var sheets = {};
      sheetNames.forEach(function (sheetName) {
        sheets[sheetName] = getExistingSheet(sheetName);
        snapshots[sheetName] = sheets[sheetName].getDataRange().getValues();
        try {
          validateExpectedVersions(sheetName, snapshots[sheetName], expectedVersions && expectedVersions[sheetName]);
        } catch (error) {
          // ข้อมูลที่ใช้เทียบมาจากแคชที่ไม่ตรงกับชีตแล้ว: ล้างทิ้ง ให้การโหลดครั้งถัดไปอ่านชีตจริง
          invalidate(sheetName);
          throw error;
        }
      });
      try {
        sheetNames.forEach(function (sheetName) {
          writeRecords(sheets[sheetName], getDefinition(sheetName), replacements[sheetName]);
        });
      } catch (error) {
        sheetNames.forEach(function (sheetName) {
          restoreSnapshot(sheets[sheetName], snapshots[sheetName]);
        });
        sheetNames.forEach(invalidate);
        throw error;
      }
      sheetNames.forEach(invalidate);
      return replacements;
    });
  }

  // แทนที่เฉพาะแถวที่ drop(record) คืน true ด้วย records ใหม่ โดยอ่านชีตจริงภายใต้ล็อก (ไม่พึ่งแคช)
  // ใช้กับตารางเชื่อมโยง เช่น บทบาทของผู้ใช้ ที่แต่ละคนแก้เฉพาะแถวของตนเอง จึงไม่ต้องตรวจรุ่นทั้งตาราง
  function replaceRows(sheetName, drop, records) {
    return withLock(function () {
      var sheet = getExistingSheet(sheetName);
      var headers = getDefinition(sheetName);
      var lastRow = sheet.getLastRow();
      var current = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
        .map(function (row) { return rowToObject(headers, row); });
      var kept = current.filter(function (record) { return record.id !== '' && !drop(record); });
      writeRecords(sheet, headers, kept.concat(records || []));
      invalidate(sheetName);
      return records;
    });
  }

  function validateExpectedVersions(sheetName, values, expected) {
    if (!expected) return;
    var headers = getDefinition(sheetName);
    var records = values.slice(1).map(function (row) { return rowToObject(headers, row); });
    if (Object.prototype.hasOwnProperty.call(expected, '__count') && Number(expected.__count) !== records.length) {
      throw serviceError('VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
    }
    Object.keys(expected).filter(function (id) { return id !== '__count'; }).forEach(function (id) {
      var record = records.filter(function (item) { return String(item.id) === String(id); })[0];
      if (!record || Number(record.version) !== Number(expected[id])) {
        throw serviceError('VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
      }
    });
  }

  function writeRecords(sheet, headers, records) {
    var existingRows = Math.max(0, sheet.getLastRow() - 1);
    if (existingRows > 0) sheet.getRange(2, 1, existingRows, headers.length).clearContent();
    if (records.length > 0) {
      sheet.getRange(2, 1, records.length, headers.length)
        .setValues(records.map(function (record) { return objectToRow(headers, record); }));
    }
  }

  function restoreSnapshot(sheet, snapshot) {
    var rows = Math.max(sheet.getLastRow(), snapshot.length);
    var columns = Math.max(sheet.getLastColumn(), snapshot[0].length);
    sheet.getRange(1, 1, rows, columns).clearContent();
    sheet.getRange(1, 1, snapshot.length, snapshot[0].length).setValues(snapshot);
  }

  // ลดเซลล์ว่าง: ลบคอลัมน์ว่างทางขวาของหัวตาราง และแถวว่างท้ายตารางที่เกิน 200 แถว (ไม่แตะข้อมูล)
  // Google Sheets 1 ไฟล์รับได้ 10 ล้านเซลล์ แผ่นงานใหม่แต่ละแผ่นจองไว้ 26,000 เซลล์แม้ยังว่าง
  function compactSheets() {
    var freed = 0;
    var touched = 0;
    withLock(function () {
      Object.keys(APP_CONFIG.SHEETS).forEach(function (sheetName) {
        var sheet = getSpreadsheet().getSheetByName(sheetName);
        if (!sheet) return;
        var headers = getDefinition(sheetName);
        var keepColumns = Math.max(headers.length, sheet.getLastColumn());
        var maxColumns = sheet.getMaxColumns();
        var keepRows = Math.max(sheet.getLastRow(), 1) + 200;
        var maxRows = sheet.getMaxRows();
        var before = maxColumns * maxRows;
        if (maxColumns > keepColumns) sheet.deleteColumns(keepColumns + 1, maxColumns - keepColumns);
        if (maxRows > keepRows) sheet.deleteRows(keepRows + 1, maxRows - keepRows);
        var after = sheet.getMaxColumns() * sheet.getMaxRows();
        if (after < before) { freed += before - after; touched += 1; }
      });
    });
    return { freed: freed, sheets: touched };
  }

  // เปลี่ยนโรงเรียนระหว่างคำขอ (ใช้ตอนติดตั้งระบบให้โรงเรียนอื่น): ทิ้งทุกอย่างที่อ่านไว้ของโรงเรียนเดิม
  function resetMemo() { memo = { spreadsheet: null, sheets: {}, rows: {}, tags: {} }; batch = null; }

  // ล้างแคชทั้งหมด ใช้หลังแก้ข้อมูลในชีตด้วยมือ
  function clearAllCaches() {
    memo = { spreadsheet: null, sheets: {}, rows: {}, tags: {} };
    // เปลี่ยน era: แคชตาราง ผลลัพธ์ และผลสรุปในชีต Summaries ทั้งหมดหมดอายุพร้อมกัน
    var versions = readVersions();
    versions._era = newEra();
    saveVersions(versions);
    memo.versions = versions;
    var cache = getSharedCache();
    if (cache) {
      try { cache.removeAll(['tbl:v4:Summaries', schemaKey()]); cache.put('auth:epoch', String(Date.now()), 21600); } catch (error) { /* ignore */ }
    }
  }

  // ---------- อุ่นระบบ: โหลดตารางที่ยังไม่อยู่ในแคชเข้าแคชล่วงหน้า ----------
  // ให้คนแรกที่เปิดเว็บไม่ต้องรออ่านชีต (เรียกจากหน้าเว็บหลังเข้าสู่ระบบ หรือจากทริกเกอร์ตามเวลา)
  function warmTables(sheetNames) {
    var cache = getSharedCache();
    var names = (sheetNames || Object.keys(APP_CONFIG.SHEETS)).filter(isSharedCached);
    if (!cache) return { loaded: 0, cached: 0 };
    var present = {};
    try { present = cache.getAll(names.map(sharedKey)); } catch (error) { present = {}; }
    var loaded = 0;
    names.forEach(function (sheetName) {
      if (present[sharedKey(sheetName)]) return;
      // ถ้าคำขอนี้อ่านตารางไว้แล้ว (memo) ก็เขียนลงแคชกลางเลย
      try {
        var held = !!memo.rows[sheetName];
        var rows = loadRows(sheetName);
        if (held) writeSharedCache(sheetName, rows);
        loaded += 1;
      } catch (error) { /* ตารางที่ยังไม่มี ข้ามไป */ }
    });
    return { loaded: loaded, cached: names.length - loaded };
  }

  // สถานะแคชของทุกตาราง (true = อยู่ในแคช)
  function cacheStatus() {
    var cache = getSharedCache();
    var names = Object.keys(APP_CONFIG.SHEETS).filter(isSharedCached);
    var present = {};
    try { present = cache ? cache.getAll(names.map(sharedKey)) : {}; } catch (error) { present = {}; }
    return names.reduce(function (result, name) { result[name] = !!present[sharedKey(name)]; return result; }, {});
  }

  function serviceError(code, message, fieldErrors) {
    var error = new Error(message);
    error.code = code;
    error.fieldErrors = fieldErrors || {};
    return error;
  }

  return { resetMemo: resetMemo,
    getSpreadsheet: getSpreadsheet,
    ensureSheet: ensureSheet,
    getExistingSheet: getExistingSheet,
    assertSchema: assertSchema,
    rowToObject: rowToObject,
    objectToRow: objectToRow,
    all: all,
    find: find,
    findById: findById,
    insert: insert,
    insertMany: insertMany,
    readColumns: readColumns,
    findByField: findByField,
    readLastRows: readLastRows,
    runBatch: runBatch,
    update: update,
    softDelete: softDelete,
    withLock: withLock,
    replaceTablesAtomically: replaceTablesAtomically,
    compactSheets: compactSheets,
    replaceRows: replaceRows,
    clearAllCaches: clearAllCaches,
    memoResult: memoResult,
    warmTables: warmTables,
    bulkStatus: bulkStatus,
    bulkVerify: bulkVerify,
    cacheStatus: cacheStatus,
    summaryInfo: summaryInfo,
    tableVersions: function () { return Object.assign({}, tableVersions()); },
    serviceError: serviceError
  };
})();

// Run ใน editor หลังแก้ข้อมูลใน Google Sheet ด้วยมือ เพื่อให้หน้าเว็บเห็นข้อมูลใหม่ทันที
function clearCache() {
  SheetRepository.clearAllCaches();
  return { ok: true };
}
