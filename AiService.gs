// ผู้ช่วย AI กลางของทั้งระบบ: ทุกเมนูเรียกผ่าน AiService.run(context, 'ชื่อเรื่อง', ...)
// - แต่ละเรื่อง (APP_CONFIG.AI_FEATURES) มี API key ผู้ให้บริการ รุ่น เปิด/ปิด โควตาต่อชั่วโมง และบทบาทที่ใช้ได้ของตัวเอง
// - API key เก็บใน Script Properties (AI_KEY_<เรื่อง>) ไม่ส่งไปหน้าเว็บ แสดงได้แค่ 4 ตัวท้าย
// - ตัดเลขประจำตัวประชาชน เบอร์โทร และอีเมลออกก่อนส่งทุกครั้ง
var AiService = (function () {
  'use strict';

  var CONFIG_PROPERTY = 'AI_CONFIG';
  var ALL_ROLES = ['admin', 'executive', 'teacher'];
  var MAX_PROMPT_CHARS = 12000;

  function props() { return Tenant.props(); }
  function keyProperty(feature) { return 'AI_KEY_' + String(feature).toUpperCase(); }

  function features() { return APP_CONFIG.AI_FEATURES; }
  function provider(key) { return APP_CONFIG.AI_PROVIDERS.filter(function (item) { return item.key === key; })[0] || null; }
  function assertFeature(feature) {
    if (!features().some(function (item) { return item.key === feature; })) throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่พบเรื่อง AI ที่ระบุ');
  }

  function readAll() {
    try { return JSON.parse(props().getProperty(CONFIG_PROPERTY) || '{}') || {}; } catch (error) { return {}; }
  }

  // ค่าที่ใช้จริงของแต่ละเรื่อง (เติมค่าเริ่มต้นให้ช่องที่ยังไม่ได้ตั้ง)
  function configOf(feature, all) {
    var raw = (all || readAll())[feature] || {};
    var chosen = provider(raw.provider) ? raw.provider : 'gemini';
    var roles = Array.isArray(raw.roles) ? raw.roles.filter(function (role) { return ALL_ROLES.indexOf(role) !== -1; }) : ALL_ROLES.slice();
    return {
      enabled: raw.enabled === true,
      provider: chosen,
      model: String(raw.model || '').trim() || provider(chosen).model,
      hourlyLimit: Math.min(1000, Math.max(1, Number(raw.hourlyLimit) || 30)),
      roles: roles
    };
  }

  function keyHint(feature) {
    var key = props().getProperty(keyProperty(feature)) || '';
    return key ? '••••' + key.slice(-4) : '';
  }

  function getSettings(token) {
    AuthService.requirePermission(token, 'aiSettings.view');
    var all = readAll();
    return {
      providers: APP_CONFIG.AI_PROVIDERS,
      roles: [{ key: 'admin', name: 'ผู้ดูแลระบบ' }, { key: 'executive', name: 'ผู้บริหาร' }, { key: 'teacher', name: 'ครู' }],
      features: features().map(function (item) {
        return Object.assign({}, item, configOf(item.key, all), { keyHint: keyHint(item.key) });
      })
    };
  }

  function saveSettings(token, data) {
    var context = AuthService.requirePermission(token, 'aiSettings.edit');
    var input = (data && data.features) || [];
    var all = readAll();
    var errors = {};
    input.forEach(function (item) {
      var feature = String(item.key || '');
      if (!features().some(function (known) { return known.key === feature; })) return;
      if (!provider(item.provider)) { errors[feature + '.provider'] = 'กรุณาเลือกผู้ให้บริการ'; return; }
      var model = String(item.model || '').trim();
      if (model && !/^[A-Za-z0-9._:\-\/]{2,100}$/.test(model)) { errors[feature + '.model'] = 'ชื่อรุ่นไม่ถูกต้อง'; return; }
      all[feature] = {
        enabled: item.enabled === true,
        provider: item.provider,
        model: model,
        hourlyLimit: Math.min(1000, Math.max(1, Number(item.hourlyLimit) || 30)),
        roles: (Array.isArray(item.roles) ? item.roles : ALL_ROLES).filter(function (role) { return ALL_ROLES.indexOf(role) !== -1; })
      };
      var apiKey = String(item.apiKey || '').trim();
      if (apiKey) {
        if (apiKey.length < 10 || apiKey.length > 400 || /\s/.test(apiKey)) { errors[feature + '.apiKey'] = 'API key ไม่ถูกต้อง'; return; }
        props().setProperty(keyProperty(feature), apiKey);
      } else if (item.clearKey === true) {
        props().deleteProperty(keyProperty(feature));
      }
    });
    if (Object.keys(errors).length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบการตั้งค่า AI', errors);
    props().setProperty(CONFIG_PROPERTY, JSON.stringify(all));
    AuditService.write('AI_SETTINGS_SAVE', 'Settings', 'ai', {}, context.user.id);
    return getSettings(token);
  }

  // เรื่องใดบ้างที่ผู้ใช้คนนี้กดใช้ได้ (หน้าเว็บใช้ซ่อน/แสดงปุ่ม AI)
  function status(token) {
    var context = AuthService.requireSession(token);
    var all = readAll();
    var result = {};
    features().forEach(function (item) { result[item.key] = usable(context, item.key, all); });
    return result;
  }

  function usable(context, feature, all) {
    var config = configOf(feature, all);
    return config.enabled && Boolean(props().getProperty(keyProperty(feature))) &&
      (context.roles || []).some(function (role) { return config.roles.indexOf(role) !== -1; });
  }

  // เลือกเรื่อง AI ตัวแรกที่ผู้ใช้คนนี้ใช้ได้ (เปิดอยู่ + มี key + บทบาทได้รับสิทธิ์) เช่น ['care', 'bot'] = ใช้ key ดูแลช่วยเหลือก่อน ถ้าไม่มีใช้ key บอท
  // ถ้าไม่มีเรื่องใดใช้ได้ คืนเรื่องสุดท้าย เพื่อให้ข้อความแจ้งเตือนชี้ไปที่เรื่องที่แนะนำให้ตั้งค่า
  function pickFeature(context, list) {
    var all = readAll();
    for (var index = 0; index < list.length; index += 1) if (usable(context, list[index], all)) return list[index];
    return list[list.length - 1];
  }

  // ตัดข้อมูลที่ระบุตัวบุคคลได้ออกก่อนส่งออกนอกระบบ
  function redact(text) {
    return String(text || '')
      .replace(/\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/g, '[เลขประจำตัว]')
      .replace(/\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/g, '[เบอร์โทร]')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[อีเมล]');
  }

  function checkRate(feature, limit) {
    var cache = Tenant.cache();
    var key = 'ai:rate:' + feature + ':' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHH');
    var used = Number(cache.get(key) || 0);
    if (used >= limit) throw SheetRepository.serviceError('AI_LIMIT', 'ใช้ AI เรื่องนี้ครบโควตาของชั่วโมงนี้แล้ว (' + limit + ' ครั้ง) กรุณาลองใหม่ภายหลัง');
    cache.put(key, String(used + 1), 3700);
  }

  // เรียก AI: messages = [{ role: 'user'|'assistant', text }]
  function run(context, feature, systemPrompt, messages, options) {
    assertFeature(feature);
    var all = readAll();
    var config = configOf(feature, all);
    var name = features().filter(function (item) { return item.key === feature; })[0].name;
    if (!config.enabled) throw SheetRepository.serviceError('AI_DISABLED', name + ' ยังไม่เปิดใช้งาน (ผู้ดูแลระบบเปิดได้ที่เมนู "ตั้งค่า AI")');
    var apiKey = props().getProperty(keyProperty(feature));
    if (!apiKey) throw SheetRepository.serviceError('AI_DISABLED', name + ' ยังไม่ได้ใส่ API key (เมนู "ตั้งค่า AI")');
    if (!(context.roles || []).some(function (role) { return config.roles.indexOf(role) !== -1; })) {
      throw SheetRepository.serviceError('FORBIDDEN', 'บทบาทของคุณยังไม่ได้รับสิทธิ์ใช้ ' + name);
    }
    var list = (Array.isArray(messages) ? messages : [{ role: 'user', text: String(messages || '') }])
      .filter(function (message) { return message && String(message.text || '').trim(); })
      .slice(-10)
      .map(function (message) { return { role: message.role === 'assistant' ? 'assistant' : 'user', text: redact(message.text).slice(0, MAX_PROMPT_CHARS) }; });
    if (!list.length || list[list.length - 1].role !== 'user') throw SheetRepository.serviceError('VALIDATION_ERROR', 'ไม่มีข้อความสำหรับส่งให้ AI');
    checkRate(feature, config.hourlyLimit);
    var opts = options || {};
    var text = callProvider(config, apiKey, redact(systemPrompt), list, { maxTokens: opts.maxTokens || 1500, temperature: opts.temperature === undefined ? 0.4 : opts.temperature });
    AuditService.write('AI_USE', 'Ai', feature, { provider: config.provider }, context.user.id);
    return { text: text, provider: config.provider, model: config.model };
  }

  function callProvider(config, apiKey, systemPrompt, messages, options) {
    var request;
    if (config.provider === 'gemini') {
      request = {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(config.model) + ':generateContent',
        headers: { 'x-goog-api-key': apiKey },
        body: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(function (message) { return { role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] }; }),
          generationConfig: { temperature: options.temperature, maxOutputTokens: Math.max(options.maxTokens, 2048) }
        },
        read: function (json) {
          var parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
          return parts.map(function (part) { return part.text || ''; }).join('');
        }
      };
    } else if (config.provider === 'claude') {
      request = {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: { model: config.model, max_tokens: options.maxTokens, temperature: options.temperature, system: systemPrompt,
          messages: messages.map(function (message) { return { role: message.role, content: message.text }; }) },
        read: function (json) { return (json.content || []).map(function (part) { return part.type === 'text' ? part.text : ''; }).join(''); }
      };
    } else {
      var isOpenAi = config.provider === 'openai';
      var body = { model: config.model, temperature: options.temperature,
        messages: [{ role: 'system', content: systemPrompt }].concat(messages.map(function (message) { return { role: message.role, content: message.text }; })) };
      body[isOpenAi ? 'max_completion_tokens' : 'max_tokens'] = options.maxTokens;
      request = {
        url: isOpenAi ? 'https://api.openai.com/v1/chat/completions' : 'https://api.opentyphoon.ai/v1/chat/completions',
        headers: { Authorization: 'Bearer ' + apiKey },
        body: body,
        read: function (json) { return ((((json.choices || [])[0] || {}).message) || {}).content || ''; }
      };
    }
    var response;
    try {
      response = UrlFetchApp.fetch(request.url, { method: 'post', contentType: 'application/json', headers: request.headers,
        payload: JSON.stringify(request.body), muteHttpExceptions: true });
    } catch (error) {
      throw SheetRepository.serviceError('AI_ERROR', 'เชื่อมต่อผู้ให้บริการ AI ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    }
    var code = response.getResponseCode();
    var raw = response.getContentText();
    if (code < 200 || code >= 300) {
      console.error(JSON.stringify({ code: 'AI_HTTP', provider: config.provider, status: code, detail: String(raw).slice(0, 300) }));
      var message = code === 401 || code === 403 ? 'API key ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน'
        : code === 404 ? 'ไม่พบรุ่น AI "' + config.model + '" กรุณาตรวจชื่อรุ่นที่หน้า "ตั้งค่า AI"'
        : code === 429 ? 'ผู้ให้บริการ AI แจ้งว่าใช้งานถี่เกินไปหรือโควตาหมด กรุณารอสักครู่'
        : 'ผู้ให้บริการ AI ตอบกลับผิดพลาด (HTTP ' + code + ')';
      throw SheetRepository.serviceError('AI_ERROR', message);
    }
    var text;
    try { text = request.read(JSON.parse(raw)); } catch (error) { text = ''; }
    text = String(text || '').trim();
    if (!text) throw SheetRepository.serviceError('AI_ERROR', 'AI ไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่');
    return text;
  }

  // ทดสอบการเชื่อมต่อของเรื่องที่เลือก (ผู้ดูแลระบบ)
  function test(token, data) {
    var context = AuthService.requirePermission(token, 'aiSettings.edit');
    var feature = String((data && data.feature) || '');
    assertFeature(feature);
    var result = run(context, feature, 'ตอบเป็นภาษาไทยสั้น ๆ', [{ role: 'user', text: 'ทดสอบการเชื่อมต่อ ตอบว่า "เชื่อมต่อสำเร็จ" พร้อมชื่อรุ่นของคุณ' }],
      { maxTokens: 100, temperature: 0 });
    return { ok: true, reply: result.text.slice(0, 300), provider: result.provider, model: result.model };
  }

  // ---------- ผู้ช่วยทั่วไป: ตอบจากสถิติภาพรวม (ไม่มีข้อมูลรายบุคคล) ----------
  function snapshot() {
    return SheetRepository.memoResult('ai:snapshot', function () {
      var settings = SettingsService.getPublicSettings();
      var year = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0] || {};
      var yearId = String(year.id || '');
      var inYear = function (sheet) { return SheetRepository.all(sheet).filter(function (row) { return !yearId || String(row.academicYearId) === yearId; }); };
      var countBy = function (rows, key) {
        return rows.reduce(function (result, row) { var value = row[key] || 'ไม่ระบุ'; result[value] = (result[value] || 0) + 1; return result; }, {});
      };
      var rooms = inYear('Homerooms');
      var enrollments = inYear('StudentEnrollments').filter(function (row) { return row.status !== 'ย้ายออก'; });
      var roomLevel = rooms.reduce(function (index, room) { index[room.id] = room.gradeLevel; return index; }, {});
      var byLevel = {};
      enrollments.forEach(function (row) { var level = roomLevel[row.homeroomId] || 'ไม่ระบุ'; byLevel[level] = (byLevel[level] || 0) + 1; });
      var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
      var attendance = AttendanceService.dashboardSummary(today);
      var trend = attendance.trend || [];
      return {
        โรงเรียน: settings.schoolName, ปีการศึกษา: year.year ? year.year + '/' + year.term : '',
        จำนวนนักเรียน: enrollments.length, นักเรียนแยกชั้น: byLevel, จำนวนห้องเรียน: rooms.length,
        จำนวนบุคลากร: SheetRepository.all('Personnel').length,
        อัตรามาเรียนเฉลี่ย_30วัน: trend.length ? Math.round(trend.reduce(function (sum, day) { return sum + day.rate; }, 0) * 10 / trend.length) / 10 + '%' : 'ไม่มีข้อมูล',
        ผลประเมินSDQ: countBy(inYear('SdqAssessments'), 'result'),
        ผลคัดกรองนักเรียน: countBy(inYear('Screenings'), 'result'),
        การให้คำปรึกษา: countBy(inYear('Counselings'), 'status'),
        การส่งต่อ: countBy(inYear('Referrals'), 'referType'),
        เหตุความไม่ปลอดภัยตามกลุ่มภัย: countBy(inYear('SafetyIncidents'), 'category'),
        เหตุความไม่ปลอดภัยตามสถานะ: countBy(inYear('SafetyIncidents'), 'status'),
        จุดเสี่ยงตามสถานะ: countBy(inYear('SafetyRisks'), 'status'),
        ผลนิเทศการสอน: countBy(inYear('Supervisions'), 'result'),
        ผลงานและรางวัลตามระดับ: countBy(inYear('Awards'), 'level')
      };
    }, { stamp: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd') });
  }

  function assistant(token, data) {
    var context = AuthService.requirePermission(token, 'ai.use');
    var history = Array.isArray(data && data.messages) ? data.messages.slice(-8) : [];
    var last = history[history.length - 1];
    if (!last || last.role !== 'user' || !String(last.text || '').trim()) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาพิมพ์คำถาม');
    if (String(last.text).length > 1000) throw SheetRepository.serviceError('VALIDATION_ERROR', 'คำถามยาวเกิน 1,000 ตัวอักษร');
    var system = 'คุณคือผู้ช่วย AI ของระบบบริหารจัดการโรงเรียน ตอบเป็นภาษาไทย สุภาพ กระชับ อ่านง่าย\n' +
      'ตอบโดยอ้างอิงเฉพาะสถิติภาพรวมด้านล่างเท่านั้น ถ้าไม่มีข้อมูลที่ถาม ให้บอกตรง ๆ ว่าไม่มีข้อมูลในระบบ ห้ามเดาหรือแต่งตัวเลข\n' +
      'ให้ข้อเสนอแนะเชิงบริหารที่นำไปทำได้จริงเมื่อเหมาะสม\n\nสถิติภาพรวมของโรงเรียน (JSON):\n' + JSON.stringify(snapshot());
    var result = run(context, 'assistant', system, history, { maxTokens: 1200 });
    return { reply: result.text };
  }

  return { getSettings: getSettings, saveSettings: saveSettings, status: status, run: run, test: test, assistant: assistant,
    redact: redact, configOf: configOf, pickFeature: pickFeature };
})();
