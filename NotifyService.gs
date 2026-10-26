/**
 * แจ้งเตือนผ่าน LINE (Messaging API) และ Telegram
 * - เลือกได้ว่าจะแจ้งเรื่องใดบ้าง (EVENTS) และแยกส่งตามหมวด (วิชาการ ดูแลช่วยเหลือ ความปลอดภัย บุคลากร ผู้ดูแลระบบ)
 *   หมวดที่ไม่ได้ตั้งกลุ่มแยก ส่งเข้ากลุ่มหลัก
 * - โทเคนเก็บใน Script Properties เท่านั้น (ไม่อยู่ใน Sheet และไม่ส่งกลับไปหน้าเว็บ)
 * - ส่งไม่สำเร็จจะไม่ทำให้การบันทึกข้อมูลล้มเหลว
 */
var NotifyService = (function () {
  'use strict';

  var KEYS = {
    lineEnabled: 'NOTIFY_LINE_ENABLED', lineToken: 'NOTIFY_LINE_TOKEN', lineTo: 'NOTIFY_LINE_TO',
    telegramEnabled: 'NOTIFY_TELEGRAM_ENABLED', telegramToken: 'NOTIFY_TELEGRAM_TOKEN', telegramChatId: 'NOTIFY_TELEGRAM_CHAT_ID',
    notifySos: 'NOTIFY_ON_SOS', notifyRegistration: 'NOTIFY_ON_REGISTRATION',
    events: 'NOTIFY_EVENTS', routes: 'NOTIFY_ROUTES', studentNames: 'NOTIFY_STUDENT_NAMES'
  };

  var CATEGORIES = [
    { key: 'safety', name: 'ความปลอดภัย' }, { key: 'academic', name: 'วิชาการ' }, { key: 'care', name: 'ดูแลช่วยเหลือนักเรียน' },
    { key: 'personnel', name: 'บุคลากร (การลา)' }, { key: 'admin', name: 'ผู้ดูแลระบบ' }
  ];
  // เรื่องที่แจ้งได้ [คีย์, ชื่อ, หมวด, เปิดเป็นค่าเริ่มต้น]
  var EVENTS = [
    ['sos', 'กดปุ่ม SOS แจ้งเหตุด่วน', 'safety', true],
    ['safety-incident', 'แจ้งเหตุความไม่ปลอดภัย และเมื่อแก้ไข/ปิดเรื่องแล้ว', 'safety', true],
    ['safety-risk', 'พบจุดเสี่ยง และเมื่อแก้ไขแล้ว', 'safety', true],
    ['lesson-plan', 'ครูส่งแผนการสอน', 'academic', true],
    ['supervision-request', 'ครูส่งขอรับการนิเทศ (แผน/วีดีโอ)', 'academic', true],
    ['supervision-assign', 'มอบหมายผู้นิเทศ/กรรมการ และกรรมการให้คะแนนครบ', 'academic', true],
    ['home-visit', 'บันทึกผลการเยี่ยมบ้าน (บอกกรณีที่ต้องช่วยเหลือ)', 'care', true],
    ['care-risk', 'คัดกรอง / SDQ / ระบบดูแลช่วยเหลือ พบนักเรียนกลุ่มเสี่ยงหรือมีปัญหา', 'care', true],
    ['referral', 'ส่งต่อนักเรียน', 'care', true],
    ['student-concern', 'ห้องรับฟัง: นักเรียนแจ้งเรื่องไม่สบายใจ (แจ้งเฉพาะความเร่งด่วนและรหัสติดตาม ไม่ส่งเนื้อหาหรือชื่อ)', 'care', true],
    ['leave-request', 'ครูขอลา / ไปราชการ', 'personnel', true],
    ['leave-decision', 'ผลการอนุมัติการลา', 'personnel', true],
    ['report-review', 'ครูส่งรายงานถึงผู้บริหาร (ไปราชการ/พัฒนาตนเอง แผนการสอน บันทึกหลังสอน PLC โฮมรูม) พร้อมปุ่มเปิดเพื่อลงนาม', 'personnel', true],
    ['registration', 'มีผู้สมัครสมาชิกใหม่รออนุมัติ', 'admin', true]
  ].map(function (item) { return { key: item[0], name: item[1], category: item[2], def: item[3] }; });

  function props() { return Tenant.props(); }
  function read(key) { return props().getProperty(KEYS[key]) || ''; }
  function readJson(key) { try { return JSON.parse(read(key) || '{}') || {}; } catch (error) { return {}; } }
  function eventOf(key) { return EVENTS.filter(function (item) { return item.key === key; })[0] || null; }

  function eventStates() {
    var stored = readJson('events');
    var states = {};
    EVENTS.forEach(function (item) { states[item.key] = stored[item.key] === undefined ? item.def : stored[item.key] === true; });
    // ค่าเดิมก่อนมีรายการเรื่อง
    if (stored.sos === undefined && read('notifySos') === 'false') states.sos = false;
    if (stored.registration === undefined && read('notifyRegistration') === 'false') states.registration = false;
    return states;
  }

  function channelsReady() {
    return (read('lineEnabled') === 'true' && !!read('lineToken')) || (read('telegramEnabled') === 'true' && !!read('telegramToken'));
  }

  // ใช้ก่อนสร้างข้อความ: ถ้าไม่ได้เปิดช่องทางใดหรือปิดเรื่องนี้ไว้ ไม่ต้องทำงานต่อ (ไม่ทำให้การบันทึกช้าลง)
  function wants(eventKey) { return channelsReady() && eventStates()[eventKey] === true; }
  function showStudentNames() { return read('studentNames') === 'true'; }

  // ค่าที่ส่งให้หน้าเว็บ: ไม่ส่งโทเคนจริง บอกเพียงว่าตั้งไว้แล้วหรือยัง
  function getConfig(token) {
    AuthService.requirePermission(token, 'settings.edit');
    var states = eventStates();
    return {
      lineEnabled: read('lineEnabled') === 'true', lineTo: read('lineTo'), lineTokenSet: !!read('lineToken'),
      telegramEnabled: read('telegramEnabled') === 'true', telegramChatId: read('telegramChatId'), telegramTokenSet: !!read('telegramToken'),
      notifySos: states.sos, notifyRegistration: states.registration,
      events: EVENTS.map(function (item) { return { key: item.key, name: item.name, category: item.category, enabled: states[item.key] }; }),
      categories: CATEGORIES, routes: readJson('routes'), studentNames: showStudentNames()
    };
  }

  var LINE_TO = /^[UCR][0-9a-f]{32}$/;
  var CHAT_ID = /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/;

  function saveConfig(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var input = data || {};
    var errors = {};
    var lineTo = String(input.lineTo || '').trim();
    var chatId = String(input.telegramChatId || '').trim();
    if (lineTo && !LINE_TO.test(lineTo)) errors.lineTo = 'รูปแบบไม่ถูกต้อง (ขึ้นต้นด้วย U, C หรือ R ตามด้วย 32 ตัวอักษร)';
    if (chatId && !CHAT_ID.test(chatId)) errors.telegramChatId = 'รูปแบบไม่ถูกต้อง (ตัวเลข เช่น -100123... หรือ @ชื่อช่อง)';
    if (input.telegramToken && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(String(input.telegramToken).trim())) errors.telegramToken = 'รูปแบบโทเคนบอทไม่ถูกต้อง';
    var routes = {};
    CATEGORIES.forEach(function (category) {
      var route = (input.routes && input.routes[category.key]) || {};
      var telegram = String(route.telegramChatId || '').trim();
      var line = String(route.lineTo || '').trim();
      if (telegram && !CHAT_ID.test(telegram)) errors['route-' + category.key + '-telegram'] = 'Chat ID ไม่ถูกต้อง';
      if (line && !LINE_TO.test(line)) errors['route-' + category.key + '-line'] = 'LINE ID ไม่ถูกต้อง';
      if (telegram || line) routes[category.key] = { telegramChatId: telegram, lineTo: line };
    });
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var states = eventStates();
    var events = {};
    EVENTS.forEach(function (item) {
      var value = input.events && Object.prototype.hasOwnProperty.call(input.events, item.key) ? input.events[item.key] === true : states[item.key];
      events[item.key] = value;
    });
    if (input.notifySos !== undefined) events.sos = input.notifySos !== false;
    if (input.notifyRegistration !== undefined) events.registration = input.notifyRegistration !== false;
    var values = {};
    values[KEYS.lineEnabled] = String(input.lineEnabled === true);
    values[KEYS.lineTo] = lineTo;
    values[KEYS.telegramEnabled] = String(input.telegramEnabled === true);
    values[KEYS.telegramChatId] = chatId;
    values[KEYS.notifySos] = String(events.sos);
    values[KEYS.notifyRegistration] = String(events.registration);
    values[KEYS.events] = JSON.stringify(events);
    values[KEYS.routes] = JSON.stringify(routes);
    values[KEYS.studentNames] = String(input.studentNames === true);
    // เว้นว่าง = ใช้โทเคนเดิม, ติ๊กลบ = ล้างโทเคน
    if (input.lineToken) values[KEYS.lineToken] = String(input.lineToken).trim();
    if (input.clearLineToken) values[KEYS.lineToken] = '';
    if (input.telegramToken) values[KEYS.telegramToken] = String(input.telegramToken).trim();
    if (input.clearTelegramToken) values[KEYS.telegramToken] = '';
    props().setProperties(values);
    AuditService.write('NOTIFY_CONFIG_UPDATE', 'Settings', 'notify', {}, context.user.id);
    return getConfig(token);
  }

  function lineRequest(text, to) {
    return { url: 'https://api.line.me/v2/bot/message/push', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + read('lineToken') },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) };
  }

  // extras.button = { text, url } ปุ่มลิงก์ใต้ข้อความ (Telegram) / ต่อท้ายเป็นลิงก์ (LINE)
  function telegramRequest(text, chatId, extras) {
    var body = { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true };
    if (extras && extras.button && /^https:\/\//.test(extras.button.url)) body.reply_markup = { inline_keyboard: [[{ text: extras.button.text, url: extras.button.url }]] };
    return { url: 'https://api.telegram.org/bot' + read('telegramToken') + '/sendMessage', method: 'post', contentType: 'application/json',
      muteHttpExceptions: true, payload: JSON.stringify(body) };
  }

  // แนบไฟล์ (เช่น ใบลา PDF ใบรับรองแพทย์) ส่งเป็นเอกสารใน Telegram
  function telegramDocument(chatId, file) {
    return { url: 'https://api.telegram.org/bot' + read('telegramToken') + '/sendDocument', method: 'post', muteHttpExceptions: true,
      payload: { chat_id: String(chatId), caption: String(file.caption || '').slice(0, 900), document: file.blob } };
  }

  var MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
  function filesOf(extras) {
    return ((extras && extras.files) || []).map(function (item) {
      if (!item || !item.fileId) return null;
      try {
        var blob = DriveApp.getFileById(item.fileId).getBlob();
        if (blob.getBytes().length > MAX_DOCUMENT_BYTES) return null;
        if (item.name) blob.setName(item.name);
        return { blob: blob, caption: item.caption || '' };
      } catch (error) { return null; }
    }).filter(Boolean);
  }

  // ส่งทุกช่องทางพร้อมกัน (fetchAll) เพื่อไม่ให้การบันทึกรอนาน
  function deliver(text, route, extras) {
    var jobs = [];
    var lineTo = (route && route.lineTo) || read('lineTo');
    var chatId = (route && route.telegramChatId) || read('telegramChatId');
    var lineText = extras && extras.button ? text + '\n' + extras.button.text + ': ' + extras.button.url : text;
    if (read('lineEnabled') === 'true' && read('lineToken') && lineTo) jobs.push({ channel: 'LINE', request: lineRequest(lineText, lineTo) });
    if (read('telegramEnabled') === 'true' && read('telegramToken') && chatId) {
      jobs.push({ channel: 'Telegram', request: telegramRequest(text, chatId, extras) });
      filesOf(extras).forEach(function (file) { jobs.push({ channel: 'Telegram (ไฟล์)', request: telegramDocument(chatId, file) }); });
    }
    if (!jobs.length) return [];
    var responses;
    try {
      responses = UrlFetchApp.fetchAll(jobs.map(function (job) { return job.request; }));
    } catch (error) {
      return jobs.map(function (job) { return { channel: job.channel, ok: false, detail: error.message }; });
    }
    var results = jobs.map(function (job, index) {
      var code = responses[index].getResponseCode();
      return { channel: job.channel, ok: code === 200, status: code, detail: code === 200 ? '' : String(responses[index].getContentText()).slice(0, 200) };
    });
    results.filter(function (result) { return !result.ok; }).forEach(function (result) {
      console.error(JSON.stringify({ code: 'NOTIFY_FAILED', channel: result.channel, status: result.status, detail: result.detail }));
    });
    return results;
  }

  // ส่งข้อความของเรื่องหนึ่ง ไปยังกลุ่มของหมวดนั้น (หรือกลุ่มหลัก)
  function notify(eventKey, text, extras) {
    var event = eventOf(eventKey);
    if (!event || !wants(eventKey)) return [];
    var school = '';
    try { school = SettingsService.getPublicSettings().schoolName || ''; } catch (error) { school = ''; }
    var message = (school ? '[' + school + '] ' : '') + text;
    try { return deliver(message, readJson('routes')[event.category], extras); } catch (error) {
      console.error(JSON.stringify({ code: 'NOTIFY_FAILED', message: error.message }));
      return [];
    }
  }

  function test(token) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var text = 'ทดสอบการแจ้งเตือนจากระบบบริหารจัดการโรงเรียน โดย ' + (context.user.displayName || context.user.username);
    var results = deliver(text, null);
    var routes = readJson('routes');
    CATEGORIES.forEach(function (category) {
      if (!routes[category.key]) return;
      deliver(text + '\n(กลุ่ม' + category.name + ')', routes[category.key]).forEach(function (result) {
        results.push(Object.assign(result, { channel: result.channel + ' – ' + category.name }));
      });
    });
    if (!results.length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ยังไม่ได้ตั้งค่า LINE หรือ Telegram');
    return { results: results };
  }

  return { getConfig: getConfig, saveConfig: saveConfig, notify: notify, test: test, wants: wants, showStudentNames: showStudentNames,
    EVENTS: EVENTS, CATEGORIES: CATEGORIES };
})();
