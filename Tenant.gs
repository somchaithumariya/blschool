/**
 * หลายโรงเรียนในสคริปต์เดียว: แต่ละโรงเรียน (tenant) มีฐานข้อมูล Google Sheet โฟลเดอร์ไฟล์ บัญชีผู้ใช้ รหัสผ่าน
 * และการตั้งค่าของตัวเองแยกขาดจากกัน
 *  - โรงเรียนหลัก (เจ้าของระบบ) ใช้รหัสว่าง '' และใช้ค่าเดิมทั้งหมด (ไม่มีคำนำหน้า) ระบบเดิมจึงทำงานเหมือนเดิม
 *  - โรงเรียนอื่นเปิดผ่านลิงก์ ...?s=<รหัส> ค่าใน Script Properties และ Cache ของโรงเรียนนั้นมีคำนำหน้า t:<รหัส>:
 * ทุกบริการต้องเรียก Tenant.props() / Tenant.cache() แทน PropertiesService.getScriptProperties() / CacheService.getScriptCache()
 */
var Tenant = (function () {
  'use strict';

  var CODE_PATTERN = /^[a-z0-9]{4,20}$/;
  var RECORD_PREFIX = 'TENANT:';
  var current = '';
  var exclusive = false;
  var recordMemo = {};

  function rawProps() { return PropertiesService.getScriptProperties(); }
  function rawCache() { return typeof CacheService === 'undefined' ? null : CacheService.getScriptCache(); }
  function prefix() { return current ? 't:' + current + ':' : ''; }

  function code() { return current; }
  function isMain() { return current === ''; }
  function isExclusive() { return exclusive; }

  function record(tenantCode) {
    if (!tenantCode) return null;
    if (Object.prototype.hasOwnProperty.call(recordMemo, tenantCode)) return recordMemo[tenantCode];
    var value = null;
    try { value = JSON.parse(rawProps().getProperty(RECORD_PREFIX + tenantCode) || 'null'); } catch (error) { value = null; }
    recordMemo[tenantCode] = value;
    return value;
  }

  function saveRecord(tenantCode, value) {
    rawProps().setProperty(RECORD_PREFIX + tenantCode, JSON.stringify(value));
    recordMemo[tenantCode] = value;
    return value;
  }

  function allRecords() {
    var all = rawProps().getProperties();
    return Object.keys(all).filter(function (key) { return key.indexOf(RECORD_PREFIX) === 0; }).map(function (key) {
      var value = {};
      try { value = JSON.parse(all[key]) || {}; } catch (error) { value = {}; }
      return Object.assign({ code: key.slice(RECORD_PREFIX.length) }, value);
    });
  }

  // เลือกโรงเรียนสำหรับคำขอนี้ (options.allowInstalling = ใช้ระหว่างติดตั้ง)
  function use(tenantCode, options) {
    var next = String(tenantCode || '').trim().toLowerCase();
    if (next && !CODE_PATTERN.test(next)) throw notFound();
    if (next) {
      var info = record(next);
      if (!info) throw notFound();
      if (info.status === 'suspended') throw SheetRepository.serviceError('TENANT_SUSPENDED', 'ระบบของโรงเรียนนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบกลาง');
      if (info.status !== 'active' && !(options && options.allowInstalling)) {
        throw SheetRepository.serviceError('TENANT_NOT_READY', 'ระบบของโรงเรียนนี้กำลังติดตั้ง กรุณารอสักครู่แล้วเปิดใหม่');
      }
    }
    exclusive = !!(next && options && options.exclusive);
    if (next !== current) {
      current = next;
      // ข้อมูลที่อ่านไว้ในคำขอนี้เป็นของโรงเรียนเดิม ต้องล้างก่อนใช้โรงเรียนใหม่
      if (typeof SheetRepository !== 'undefined' && SheetRepository.resetMemo) SheetRepository.resetMemo();
    }
    return current;
  }

  function notFound() {
    return SheetRepository.serviceError('TENANT_NOT_FOUND', 'ไม่พบระบบของโรงเรียนตามลิงก์นี้ กรุณาตรวจสอบลิงก์อีกครั้ง');
  }

  // ---------- Script Properties แยกตามโรงเรียน ----------
  function props() {
    var store = rawProps();
    if (!current) return store;
    var p = prefix();
    return {
      getProperty: function (key) { return store.getProperty(p + key); },
      setProperty: function (key, value) { store.setProperty(p + key, value); return this; },
      deleteProperty: function (key) { store.deleteProperty(p + key); return this; },
      getProperties: function () {
        var all = store.getProperties();
        return Object.keys(all).reduce(function (result, key) {
          if (key.indexOf(p) === 0) result[key.slice(p.length)] = all[key];
          return result;
        }, {});
      },
      setProperties: function (values) {
        var mapped = {};
        Object.keys(values || {}).forEach(function (key) { mapped[p + key] = values[key]; });
        store.setProperties(mapped);
        return this;
      },
      getKeys: function () { return Object.keys(this.getProperties()); }
    };
  }

  // ---------- Cache แยกตามโรงเรียน ----------
  function cache() {
    var store = rawCache();
    if (!store || !current) return store;
    var p = prefix();
    var add = function (key) { return p + key; };
    return {
      get: function (key) { return store.get(add(key)); },
      put: function (key, value, ttl) { return ttl === undefined ? store.put(add(key), value) : store.put(add(key), value, ttl); },
      remove: function (key) { return store.remove(add(key)); },
      getAll: function (keys) {
        var found = store.getAll((keys || []).map(add));
        return Object.keys(found || {}).reduce(function (result, key) { result[key.slice(p.length)] = found[key]; return result; }, {});
      },
      putAll: function (values, ttl) {
        var mapped = {};
        Object.keys(values || {}).forEach(function (key) { mapped[add(key)] = values[key]; });
        return ttl === undefined ? store.putAll(mapped) : store.putAll(mapped, ttl);
      },
      removeAll: function (keys) { return store.removeAll((keys || []).map(add)); }
    };
  }

  function newCode() {
    var alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var attempt = 0; attempt < 20; attempt += 1) {
      var value = '';
      for (var index = 0; index < 7; index += 1) value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      if (!record(value)) return value;
    }
    throw new Error('สร้างรหัสโรงเรียนไม่สำเร็จ');
  }

  return { use: use, code: code, isMain: isMain, isExclusive: isExclusive, props: props, cache: cache, rawProps: rawProps, rawCache: rawCache,
    record: record, saveRecord: saveRecord, allRecords: allRecords, newCode: newCode, CODE_PATTERN: CODE_PATTERN };
})();
