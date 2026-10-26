/**
 * ห้องรับฟัง: ช่องทางให้นักเรียนบอกเรื่องที่ไม่สบายใจ / ขอคำปรึกษา (หน้าสาธารณะ ?page=concern) และกล่องรับเรื่องสำหรับทีมดูแล
 *
 * ออกแบบให้ไม่ทำให้ระบบหลักช้าลง:
 *  - หน้าของนักเรียนเป็นไฟล์เล็กแยก (Concern.html) ไม่โหลดโค้ดของระบบหลัก
 *  - ตาราง StudentConcerns ไม่เข้าแคชร่วมและไม่ถูกอ่านพ่วงกับตารางอื่น (Config.gs NO_SHARED_CACHE_SHEETS / BULK_EXCLUDE_SHEETS)
 *    ส่งเรื่อง = เขียน 1 แถว · ตรวจสอบนักเรียนใช้ตาราง Students ที่อยู่ในแคชอยู่แล้ว
 *
 * ความเป็นส่วนตัว:
 *  - นักเรียนเลือกได้ว่าจะไม่บอกชื่อ (ได้รหัสติดตามไว้อ่านคำตอบและส่งข้อความต่อ) · ไม่เก็บ IP/อุปกรณ์
 *  - เห็นเนื้อหาได้เฉพาะผู้มีสิทธิ์ concern.view (ผู้บริหารเป็นค่าเริ่มต้น ผู้ดูแลระบบเพิ่มให้ครูแนะแนวได้) · ทุกการเปิดอ่านลงบันทึกการใช้งาน
 *  - แจ้งเตือน LINE/Telegram ส่งเฉพาะระดับความเร่งด่วนและรหัสติดตาม ไม่ส่งเนื้อหาหรือชื่อ
 *  - การสร้างบันทึกให้คำปรึกษา (5.4) ไม่คัดลอกข้อความของนักเรียน (บันทึก 5.4 ครูหลายคนเปิดดูได้)
 *
 * ป้องกันการยิงซ้ำ: ช่องหลอกบอท (honeypot) · เวลากรอกขั้นต่ำ · จำกัดต่ออุปกรณ์ · จำกัดต่อ 10 นาที (ทั้งโรงเรียน) · เพดานต่อวัน
 */
var ConcernService = (function () {
  'use strict';

  var SHEET = 'StudentConcerns';
  var CONFIG_PROPERTY = 'CONCERN_CONFIG';
  var DEFAULTS = { enabled: true, allowAnonymous: true, dailyLimit: 150, introText: '' };
  var CODE_LETTERS = 'ABCDFGHJKMNPQRSTUVWXYZ';
  var CODE_CHARS = CODE_LETTERS + '23456789';
  var CODE_PATTERN = /^[A-Z][A-Z0-9]{3}-[A-Z0-9]{4}$/;
  var ABOUT = ['ตัวฉันเอง', 'เพื่อนหรือคนที่ฉันรู้จัก'];
  var PREFERRED = ['ใครก็ได้', 'ครูแนะแนว', 'ครูที่ปรึกษา', 'ผู้บริหาร'];
  var MIN_MESSAGE = 10;
  var MAX_MESSAGE = 2000;
  var MAX_FOLLOW = 1500;
  var MAX_THREAD = 40;
  var MIN_FILL_MS = 2500;
  var CLOSED = 'ปิดเรื่อง';
  var FIRST = 'รอรับเรื่อง';

  // เบอร์ที่เปิดให้ทุกคนเห็นบนหน้าของนักเรียน
  var HOTLINES = [
    { name: 'สายด่วนสุขภาพจิต (24 ชม.)', phone: '1323' }, { name: 'ศูนย์ช่วยเหลือสังคม', phone: '1300' },
    { name: 'เจ็บป่วยฉุกเฉิน', phone: '1669' }, { name: 'ตำรวจ', phone: '191' }
  ];

  // คำที่บ่งชี้ว่าต้องรีบดูแล (ตรวจจากข้อความที่ไม่มีช่องว่าง) · ระบบจัดระดับให้เองอย่างน้อยเท่าที่ตรวจพบ ไม่เชื่อแค่ที่นักเรียนเลือก
  var EMERGENCY = new RegExp('ฆ่าตัวตาย|อยากตาย|ไม่อยากอยู่(?!บ้าน|ห้อง|โรงเรียน|ที่นี่)|ไม่อยากมีชีวิต|จบชีวิต|ทำร้ายตัวเอง|กรีดแขน|กรีดข้อมือ|กรีดตัวเอง|' +
    'กินยาเกินขนาด|โดดตึก|ผูกคอ|อยากหายไปจากโลก|ไม่อยากตื่น|ไม่อยากเกิด|ชีวิตไม่มีความหมาย|พกมีด|พกปืน|มีอาวุธ|จะฆ่า');
  var URGENT = new RegExp('(โดน|ถูก)[ก-๙]{0,8}(ตี(?!แบด|เทนนิส|ปิงปอง|กอล์ฟ|กลอง|ระฆัง|เหล็ก)|ทุบ|เตะ|ต่อย|ซ้อม|บีบคอ|ทำร้าย|ขู่|แกล้ง|บังคับ|คุกคาม|ลวนลาม|ล่วงละเมิด)|' +
    '(พ่อ|แม่|พี่|ลุง|ป้า|น้า|อา|ตา|ยาย|ปู่|ย่า|แฟน)(ชอบ)?(ตี|ทุบ|ซ้อม|ต่อย|เตะ|ทำร้าย)|ทำร้ายร่างกาย|ข่มขืน|ล่วงละเมิด|ลวนลาม|อนาจาร|ข่มขู่|' +
    'แบล็กเมล|แบล็คเมล|รูปหลุด|คลิปหลุด|ตั้งท้อง|ท้องไม่พร้อม|ตั้งครรภ์|หนีออกจากบ้าน|ไม่กล้ากลับบ้าน|กลัวกลับบ้าน|ยาบ้า|ไอซ์|กัญชา|ยาเสพติด|' +
    'บุหรี่ไฟฟ้า|บูลลี่|รังแก|ไม่มีข้าวกิน|ไม่ได้กินข้าว|อดข้าว|ล่อลวง|ไม่อยากอยู่บ้าน');

  // ---------- การตั้งค่า ----------
  function readConfig() {
    var stored = {};
    try { stored = JSON.parse(Tenant.props().getProperty(CONFIG_PROPERTY) || '{}') || {}; } catch (error) { stored = {}; }
    return Object.assign({}, DEFAULTS, stored);
  }

  function publicUrl() {
    var base = DistributionService.systemUrl(Tenant.code());
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'page=concern';
  }

  function getConfig(token) {
    var context = AuthService.requirePermission(token, 'concern.view');
    return { config: readConfig(), publicUrl: publicUrl(), canConfigure: Core.hasPermission(context.permissions, 'settings.edit') };
  }

  function saveConfig(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var input = data || {};
    var errors = {};
    var limit = Math.round(Number(input.dailyLimit));
    if (!isFinite(limit) || limit < 10 || limit > 2000) errors.dailyLimit = 'ระบุ 10–2,000 เรื่องต่อวัน';
    var intro = String(input.introText || '').replace(/\s+/g, ' ').trim();
    if (intro.length > 300) errors.introText = 'ข้อความต้อนรับยาวเกิน 300 ตัวอักษร';
    if (!Core.isEmptyObject(errors)) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาตรวจสอบการตั้งค่า', errors);
    var config = { enabled: input.enabled !== false, allowAnonymous: input.allowAnonymous !== false, dailyLimit: limit, introText: intro };
    Tenant.props().setProperty(CONFIG_PROPERTY, JSON.stringify(config));
    AuditService.write('CONCERN_CONFIG', 'Settings', 'concern', {}, context.user.id);
    return { config: config, publicUrl: publicUrl(), canConfigure: true };
  }

  // ---------- ตัวช่วย ----------
  function today() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }
  function clip(value, size) { return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, size); }
  function clipLines(value, size) { return String(value === undefined || value === null ? '' : value).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, size); }
  function fail(code, message, fields) { return SheetRepository.serviceError(code, message, fields); }

  function activeYearId() {
    var year = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    return year ? String(year.id) : '';
  }

  function shortHash(text) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
    return bytes.slice(0, 8).map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  // นับครั้ง: คืน false เมื่อเกินกำหนด (ใช้แคช ไม่แตะชีต) · ถ้าแคชหรือล็อกใช้ไม่ได้ ไม่ปิดกั้นนักเรียน
  function consume(key, limit, ttl) {
    var cache = null;
    try { cache = Tenant.cache(); } catch (error) { cache = null; }
    if (!cache) return true;
    var lock = LockService.getScriptLock();
    try { lock.waitLock(5000); } catch (error) { return true; }
    try {
      var count = Number(cache.get(key)) || 0;
      if (count >= limit) return false;
      cache.put(key, String(count + 1), ttl);
      return true;
    } catch (error) {
      return true;
    } finally {
      lock.releaseLock();
    }
  }

  function deviceKey(data) {
    var device = String((data && data.device) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    return shortHash(device.length >= 8 ? device : 'anonymous-device');
  }

  function limited() { return fail('RATE_LIMITED', 'ตอนนี้มีการใช้งานหนาแน่น กรุณารอสักครู่แล้วลองใหม่ หรือบอกครูที่ไว้ใจโดยตรง'); }

  function newCode() {
    var value = CODE_LETTERS.charAt(Math.floor(Math.random() * CODE_LETTERS.length));
    for (var index = 1; index < 8; index += 1) value += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    return value.slice(0, 4) + '-' + value.slice(4);
  }

  function normalizeCode(value) {
    var flat = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return flat.length === 8 ? flat.slice(0, 4) + '-' + flat.slice(4) : '';
  }

  // ระดับความเร่งด่วน 0 ปกติ · 1 เร่งด่วน · 2 ฉุกเฉิน : ตัวใหญ่สุดของ (คำในข้อความ, หัวข้อ, ที่นักเรียนติ๊ก)
  function detectLevel(text) {
    var flat = String(text || '').replace(/\s+/g, '');
    return EMERGENCY.test(flat) ? 2 : URGENT.test(flat) ? 1 : 0;
  }
  function topicLevel(topic) {
    var found = APP_CONFIG.CONCERN_TOPICS.filter(function (item) { return item[0] === topic; })[0];
    return found ? found[1] : -1;
  }
  function levelName(level) { return APP_CONFIG.CONCERN_URGENCY[Math.max(0, Math.min(2, level))]; }
  function levelOf(name) { return Math.max(0, APP_CONFIG.CONCERN_URGENCY.indexOf(name)); }

  function threadOf(record) {
    try { var list = JSON.parse(record.threadJson || '[]'); return Array.isArray(list) ? list : []; } catch (error) { return []; }
  }
  function addToThread(record, entry) {
    var list = threadOf(record);
    list.push(entry);
    return JSON.stringify(list.slice(-MAX_THREAD));
  }

  function normalizeName(value) {
    return String(value || '').replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|น\.ส\.|นาย|นาง)/, '').replace(/\s+/g, '').toLowerCase();
  }

  function recordByCode(code) {
    var found = SheetRepository.findByField(SHEET, 'trackingCode', code)[0];
    return found || null;
  }

  // แก้แถวอย่างปลอดภัยเมื่อมีหลายคนแก้พร้อมกัน (นักเรียนส่งข้อความต่อ ขณะครูกำลังตอบ)
  function mutate(id, build, actor) {
    for (var attempt = 0; attempt < 3; attempt += 1) {
      var current = SheetRepository.findById(SHEET, id);
      if (!current) throw fail('NOT_FOUND', 'ไม่พบเรื่องนี้');
      try {
        return SheetRepository.update(SHEET, id, build(current), current.version, actor);
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt === 2) throw error;
      }
    }
    return null;
  }

  // ---------- หน้าของนักเรียน ----------
  function contactList(settings) {
    var contacts = HOTLINES.slice();
    if (settings.schoolPhone) contacts.push({ name: 'โรงเรียน', phone: String(settings.schoolPhone) });
    return contacts;
  }

  function pageData() {
    var settings = SettingsService.getPublicSettings();
    var config = readConfig();
    var contacts = contactList(settings);
    return {
      enabled: config.enabled, allowAnonymous: config.allowAnonymous, introText: config.introText,
      schoolName: settings.schoolName || 'โรงเรียน', primaryColor: settings.primaryColor || '#1e3a5f',
      tenant: Tenant.code(), contacts: contacts, aboutOptions: ABOUT, preferredOptions: PREFERRED,
      topics: APP_CONFIG.CONCERN_TOPICS.map(function (item) { return { name: item[0], level: item[1] }; }),
      minMessage: MIN_MESSAGE, maxMessage: MAX_MESSAGE, maxFollow: MAX_FOLLOW, credit: developerCredit()
    };
  }

  function page() {
    var template = HtmlService.createTemplateFromFile('Concern');
    template.boot = JSON.stringify(pageData()).replace(/</g, '\\u003c').split(String.fromCharCode(8232)).join('\\u2028')
      .split(String.fromCharCode(8233)).join('\\u2029');
    return template.evaluate().setTitle('ห้องรับฟัง')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  // สถานะที่นักเรียนอ่านเข้าใจง่าย [ขั้นที่ 0–3, ข้อความ]
  var STUDENT_STATUS = {
    'รอรับเรื่อง': [0, 'ส่งเรื่องแล้ว กำลังรอครูรับเรื่อง'],
    'รับเรื่องแล้ว': [1, 'ครูรับเรื่องแล้ว'],
    'กำลังให้คำปรึกษา': [2, 'ครูกำลังดูแลและให้คำปรึกษา'],
    'ส่งต่อ': [2, 'ครูส่งต่อให้ผู้ที่ช่วยได้ตรงเรื่องแล้ว'],
    'ปิดเรื่อง': [3, 'ครูปิดเรื่องแล้ว · ถ้ายังต้องการความช่วยเหลือ ส่งข้อความต่อได้เลย']
  };

  function studentView(record) {
    var status = STUDENT_STATUS[record.status] || STUDENT_STATUS[FIRST];
    return {
      code: record.trackingCode, receivedDate: record.receivedDate, topic: record.topic, message: record.message,
      step: status[0], statusText: status[1], closed: record.status === CLOSED,
      thread: threadOf(record).map(function (entry) { return { by: entry.by, at: entry.at, name: entry.by === 't' ? entry.name || 'ครู' : 'เรา', text: entry.text }; })
    };
  }

  function submit(data) {
    var input = data || {};
    var config = readConfig();
    if (!config.enabled) throw fail('FORBIDDEN', 'ตอนนี้ช่องทางนี้ปิดรับเรื่องชั่วคราว ถ้ามีเรื่องไม่สบายใจ บอกครูที่ไว้ใจได้เลย');
    if (String(input.website || '').trim()) throw fail('VALIDATION_ERROR', 'ไม่สามารถส่งเรื่องได้');
    if (!(Number(input.elapsed) >= MIN_FILL_MS)) throw fail('VALIDATION_ERROR', 'กรุณาอ่านและกรอกให้ครบก่อนกดส่ง');

    var errors = {};
    var topic = clip(input.topic, 80);
    var level = topicLevel(topic);
    if (level < 0) errors.topic = 'กรุณาเลือกหัวข้อ';
    var about = ABOUT.indexOf(input.aboutWho) === -1 ? ABOUT[0] : input.aboutWho;
    var preferred = PREFERRED.indexOf(input.preferred) === -1 ? PREFERRED[0] : input.preferred;
    var message = clipLines(input.message, MAX_MESSAGE + 1);
    if (message.length < MIN_MESSAGE) errors.message = 'เล่าให้ครูฟังอีกนิดนะ (อย่างน้อย ' + MIN_MESSAGE + ' ตัวอักษร)';
    else if (message.length > MAX_MESSAGE) errors.message = 'ยาวเกินไป (ไม่เกิน ' + MAX_MESSAGE + ' ตัวอักษร) แบ่งเป็นหลายข้อความได้';
    var anonymous = config.allowAnonymous ? input.anonymous !== false : false;
    var studentCode = clip(input.studentCode, 20);
    var firstName = clip(input.firstName, 60);
    if (!anonymous) {
      if (!studentCode) errors.studentCode = 'กรุณากรอกเลขประจำตัวนักเรียน';
      if (!firstName) errors.firstName = 'กรุณากรอกชื่อ';
    }
    if (!Core.isEmptyObject(errors)) throw fail('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลที่กรอก', errors);

    var device = deviceKey(input);
    if (!consume('concern:dev:' + device, 5, 3600) || !consume('concern:burst', 40, 600) || !consume('concern:day:' + today(), Number(config.dailyLimit) || DEFAULTS.dailyLimit, 90000)) {
      throw limited();
    }

    var student = null;
    var claimed = '';
    if (!anonymous) {
      var room = clip(input.room, 30);
      student = SheetRepository.all('Students').filter(function (row) {
        return String(row.studentCode).trim() === studentCode && (!row.status || row.status === 'กำลังศึกษา') && normalizeName(row.firstName) === normalizeName(firstName);
      })[0] || null;
      claimed = 'รหัส ' + studentCode + ' · ชื่อ ' + firstName + (room ? ' · ห้อง ' + room : '') +
        (student ? ' (ตรงกับทะเบียน)' : ' (ไม่ตรงกับทะเบียน ควรตรวจสอบตัวตนก่อน)');
    }

    var final = Math.max(level, detectLevel(message), input.urgentNow === true ? 1 : 0);
    var code = newCode();
    var record = SheetRepository.insert(SHEET, {
      academicYearId: activeYearId(), receivedDate: today(), trackingCode: code, topic: topic, aboutWho: about, urgency: levelName(final),
      message: message, isAnonymous: anonymous, studentId: student ? student.id : '', claimedStudent: claimed,
      contactNote: anonymous ? '' : clip(input.contactNote, 200), preferred: preferred, status: FIRST, assigneeId: '', followUpDate: '',
      internalNote: '', counselingId: '', threadJson: '[]', hasNewMessage: false
    }, 'student');
    notifyTeam(final, code, false);
    return { code: code, urgency: levelName(final), urgent: final > 0, contacts: contactList(SettingsService.getPublicSettings()) };
  }

  function notifyTeam(level, code, followUp) {
    try {
      if (!NotifyService.wants('student-concern')) return;
      var mark = level === 2 ? '🚨' : level === 1 ? '⚠️' : '💬';
      var base = DistributionService.systemUrl(Tenant.code());
      NotifyService.notify('student-concern', mark + ' ห้องรับฟัง: ' + (followUp ? 'นักเรียนส่งข้อความเพิ่มในเรื่องเดิม' : 'มีนักเรียนแจ้งเรื่องไม่สบายใจ') +
        '\nความเร่งด่วน: ' + levelName(level) + '\nรหัสติดตาม: ' + code +
        '\n(ดูเนื้อหาได้เฉพาะในระบบ สำหรับผู้มีสิทธิ์ดูแล)\nเปิดระบบ: ' + base);
    } catch (error) { console.error(JSON.stringify({ code: 'CONCERN_NOTIFY_FAILED', message: error.message })); }
  }

  function track(data) {
    var code = normalizeCode(data && data.code);
    if (!consume('concern:track:' + deviceKey(data), 20, 600) || !consume('concern:track', 120, 600)) throw limited();
    if (!code || !CODE_PATTERN.test(code)) throw fail('VALIDATION_ERROR', 'รหัสติดตามมี 8 ตัว เช่น K7M2-9QXA');
    var record = recordByCode(code);
    if (!record) throw fail('NOT_FOUND', 'ไม่พบรหัสนี้ กรุณาตรวจสอบรหัสอีกครั้ง');
    return studentView(record);
  }

  function followUp(data) {
    var input = data || {};
    var code = normalizeCode(input.code);
    if (String(input.website || '').trim()) throw fail('VALIDATION_ERROR', 'ไม่สามารถส่งข้อความได้');
    var text = clipLines(input.message, MAX_FOLLOW + 1);
    if (!code) throw fail('VALIDATION_ERROR', 'รหัสติดตามไม่ถูกต้อง');
    if (!text) throw fail('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความ', { message: 'กรุณาพิมพ์ข้อความ' });
    if (text.length > MAX_FOLLOW) throw fail('VALIDATION_ERROR', 'ข้อความยาวเกิน ' + MAX_FOLLOW + ' ตัวอักษร', { message: 'ยาวเกิน ' + MAX_FOLLOW + ' ตัวอักษร' });
    if (!consume('concern:follow:' + code, 6, 3600) || !consume('concern:dev:' + deviceKey(input), 8, 3600) || !consume('concern:burst', 40, 600)) throw limited();
    var record = recordByCode(code);
    if (!record) throw fail('NOT_FOUND', 'ไม่พบรหัสนี้ กรุณาตรวจสอบรหัสอีกครั้ง');
    var level = Math.max(levelOf(record.urgency), detectLevel(text));
    var saved = mutate(record.id, function (current) {
      return {
        threadJson: addToThread(current, { by: 's', at: Core.nowIso(), text: text }), hasNewMessage: true,
        status: current.status === CLOSED ? 'รับเรื่องแล้ว' : current.status, urgency: levelName(Math.max(level, levelOf(current.urgency)))
      };
    }, 'student');
    notifyTeam(level, code, true);
    return studentView(saved);
  }

  // ---------- กล่องรับเรื่องของทีมดูแล ----------
  function isOpen(row) { return row.status !== CLOSED; }

  function directory() {
    var lookups = EntityService.buildCachedLookups();
    var enrollments = {};
    SheetRepository.all('StudentEnrollments').forEach(function (row) { enrollments[row.academicYearId + '|' + row.studentId] = row.homeroomId; });
    function labelOf(list, id) {
      var item = (list || []).filter(function (entry) { return String(entry.id) === String(id); })[0];
      return item ? item.label : '';
    }
    return {
      student: function (studentId, yearId) {
        if (!studentId) return null;
        var name = labelOf(lookups.students, studentId);
        if (!name) return null;
        return { name: name, room: labelOf(lookups.homerooms, enrollments[yearId + '|' + studentId]) };
      },
      person: function (personnelId) { return personnelId ? labelOf(lookups.personnel, personnelId) : ''; }
    };
  }

  function staffRow(row, dir) {
    var student = dir.student(row.studentId, row.academicYearId);
    return {
      id: row.id, version: row.version, trackingCode: row.trackingCode, receivedDate: row.receivedDate, academicYearId: row.academicYearId,
      topic: row.topic, aboutWho: row.aboutWho, urgency: row.urgency || 'ปกติ', message: row.message, isAnonymous: row.isAnonymous === true,
      studentId: row.studentId || '', studentName: student ? student.name : '', studentRoom: student ? student.room : '',
      claimedStudent: row.claimedStudent || '', contactNote: row.contactNote || '', preferred: row.preferred || '',
      status: row.status || FIRST, assigneeId: row.assigneeId || '', assigneeName: dir.person(row.assigneeId), followUpDate: row.followUpDate || '',
      internalNote: row.internalNote || '', counselingId: row.counselingId || '', hasNewMessage: row.hasNewMessage === true,
      thread: threadOf(row), updatedAt: row.updatedAt
    };
  }

  function rank(row) {
    return (isOpen(row) ? 0 : 1000) - levelOf(row.urgency) * 100 - (row.hasNewMessage ? 50 : 0) - (row.status === FIRST ? 20 : 0);
  }

  function inbox(token, data) {
    var context = AuthService.requirePermission(token, 'concern.view');
    var yearId = data && data.academicYearId ? String(data.academicYearId) : '';
    var rows = SheetRepository.all(SHEET).filter(function (row) { return !yearId || String(row.academicYearId) === yearId || isOpen(row); });
    rows.sort(function (a, b) { return rank(a) - rank(b) || String(b.receivedDate).localeCompare(String(a.receivedDate)); });
    AuditService.write('CONCERN_INBOX', SHEET, 'list', { count: rows.length }, context.user.id);
    var dir = directory();
    var mine = String(context.user.personnelId || '');
    return {
      rows: rows.slice(0, 400).map(function (row) { return staffRow(row, dir); }),
      total: rows.length,
      stats: summarize(rows),
      canEdit: Core.hasPermission(context.permissions, 'concern.edit'),
      canCounsel: Core.hasPermission(context.permissions, 'concern.edit') && Core.hasPermission(context.permissions, 'care.edit'),
      myPersonnelId: mine, topics: APP_CONFIG.CONCERN_TOPICS.map(function (item) { return item[0]; }), statuses: APP_CONFIG.CONCERN_STATUSES
    };
  }

  function summarize(rows) {
    var open = rows.filter(isOpen);
    return {
      waiting: open.filter(function (row) { return row.status === FIRST; }).length,
      unread: open.filter(function (row) { return row.hasNewMessage === true; }).length,
      urgent: open.filter(function (row) { return levelOf(row.urgency) > 0; }).length,
      emergency: open.filter(function (row) { return levelOf(row.urgency) === 2; }).length,
      open: open.length, total: rows.length
    };
  }

  // จำนวนบนแดชบอร์ดของผู้มีสิทธิ์ (ผลสรุปผูกกับตารางนี้ อ่านชีตใหม่เฉพาะเมื่อมีเรื่องเข้า/แก้)
  function dashboardSummary(context) {
    if (!Core.hasPermission(context.permissions, 'concern.view')) return null;
    try {
      return SheetRepository.memoResult('concern:summary', function () { return summarize(SheetRepository.all(SHEET)); }, { deps: [SHEET] });
    } catch (error) {
      console.error(JSON.stringify({ code: 'CONCERN_SUMMARY_FAILED', message: error.message }));
      return null;
    }
  }

  function requireEdit(token) { return AuthService.requirePermission(token, 'concern.edit'); }

  function load(data) {
    var record = SheetRepository.findById(SHEET, data && data.id);
    if (!record) throw fail('NOT_FOUND', 'ไม่พบเรื่องนี้');
    return record;
  }

  function update(token, data) {
    var context = requireEdit(token);
    var input = data || {};
    var record = load(input);
    var changes = {};
    var errors = {};
    if (input.status !== undefined) {
      if (APP_CONFIG.CONCERN_STATUSES.indexOf(input.status) === -1) errors.status = 'สถานะไม่ถูกต้อง';
      else changes.status = input.status;
    }
    if (input.assigneeId !== undefined) {
      var assignee = String(input.assigneeId || '');
      if (assignee && !SheetRepository.findById('Personnel', assignee)) errors.assigneeId = 'ไม่พบบุคลากร';
      else changes.assigneeId = assignee;
    }
    if (input.followUpDate !== undefined) {
      var due = String(input.followUpDate || '');
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) errors.followUpDate = 'รูปแบบวันที่ไม่ถูกต้อง';
      else changes.followUpDate = due;
    }
    if (input.internalNote !== undefined) {
      var note = clipLines(input.internalNote, 3001);
      if (note.length > 3000) errors.internalNote = 'ยาวเกิน 3,000 ตัวอักษร';
      else changes.internalNote = note;
    }
    if (input.markRead === true) changes.hasNewMessage = false;
    var merged = Object.assign({}, record, changes);
    // รับเรื่องแล้วยังไม่มีผู้ดูแล: ใส่ผู้ที่กดให้ (ถ้าบัญชีผูกกับทะเบียนบุคลากร)
    if (changes.status && changes.status !== FIRST && !merged.assigneeId && context.user.personnelId) changes.assigneeId = String(context.user.personnelId);
    if (changes.status === CLOSED && record.status !== CLOSED && levelOf(record.urgency) > 0 &&
      String(merged.internalNote || '').length < 10 && !merged.counselingId) {
      errors.status = 'เรื่องเร่งด่วน/ฉุกเฉินต้องมีบันทึกภายในของทีม หรือบันทึกให้คำปรึกษา (5.4) ก่อนปิดเรื่อง';
    }
    if (!Core.isEmptyObject(errors)) throw fail('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var saved = SheetRepository.update(SHEET, record.id, changes, input.version, context.user.id);
    AuditService.write('CONCERN_UPDATE', SHEET, record.id, { fields: Object.keys(changes) }, context.user.id);
    return staffRow(saved, directory());
  }

  function reply(token, data) {
    var context = requireEdit(token);
    var input = data || {};
    var text = clipLines(input.text, MAX_FOLLOW + 1);
    if (!text) throw fail('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความตอบกลับ', { text: 'กรุณาพิมพ์ข้อความตอบกลับ' });
    if (text.length > MAX_FOLLOW) throw fail('VALIDATION_ERROR', 'ข้อความยาวเกิน ' + MAX_FOLLOW + ' ตัวอักษร', { text: 'ยาวเกิน ' + MAX_FOLLOW + ' ตัวอักษร' });
    var record = load(input);
    var name = context.user.displayName || context.user.username;
    var saved = SheetRepository.update(SHEET, record.id, {
      threadJson: addToThread(record, { by: 't', at: Core.nowIso(), name: name, text: text }), hasNewMessage: false,
      status: record.status === FIRST ? 'รับเรื่องแล้ว' : record.status,
      assigneeId: record.assigneeId || (context.user.personnelId ? String(context.user.personnelId) : '')
    }, input.version, context.user.id);
    AuditService.write('CONCERN_REPLY', SHEET, record.id, {}, context.user.id);
    return staffRow(saved, directory());
  }

  function issueTypeOf(topic) {
    if (/เรียน/.test(topic)) return 'ด้านการเรียน';
    if (/สุขภาพกาย/.test(topic)) return 'ด้านสุขภาพ';
    if (/ครอบครัว|ถูกทำร้าย|ความรู้สึก|ไม่อยากอยู่/.test(topic)) return 'ด้านครอบครัวและส่วนตัว';
    if (/เพื่อน|รังแก|บุหรี่|ความรัก|ความปลอดภัย/.test(topic)) return 'ด้านการปรับตัวและพฤติกรรม';
    return 'อื่น ๆ';
  }

  // สร้างบันทึกให้คำปรึกษา (5.4) ล่วงหน้า · ไม่คัดลอกข้อความของนักเรียน เพราะบันทึก 5.4 อยู่ในแฟ้มดูแลที่ครูหลายคนเปิดดูได้
  function toCounseling(token, data) {
    var context = requireEdit(token);
    if (!Core.hasPermission(context.permissions, 'care.edit')) throw fail('FORBIDDEN', 'ต้องมีสิทธิ์บันทึกข้อมูลดูแลช่วยเหลือนักเรียน (care.edit)');
    var record = load(data);
    if (record.counselingId && SheetRepository.findById('Counselings', record.counselingId)) {
      return { counselingId: record.counselingId, already: true, row: staffRow(record, directory()) };
    }
    if (!record.studentId) throw fail('VALIDATION_ERROR', 'เรื่องนี้ยังไม่ระบุตัวนักเรียน (ไม่ระบุตัวตนหรือชื่อไม่ตรงทะเบียน) สร้างบันทึกได้หลังทราบตัวตนแล้ว จึงเลือกนักเรียนที่เมนู “ให้คำปรึกษา (5.4)” เอง');
    var counselor = record.assigneeId || (context.user.personnelId ? String(context.user.personnelId) : '');
    var counseling = SheetRepository.insert('Counselings', {
      academicYearId: record.academicYearId || activeYearId(), counselDate: today(), studentId: record.studentId, issueType: issueTypeOf(record.topic),
      statement: 'นักเรียนขอรับคำปรึกษาผ่านห้องรับฟัง (รหัส ' + record.trackingCode + ') หัวข้อ: ' + record.topic +
        (levelOf(record.urgency) > 0 ? ' · ระดับ' + record.urgency : '') + '\n(รายละเอียดอยู่ที่เมนู “ห้องรับฟังนักเรียน” เปิดดูได้เฉพาะผู้มีสิทธิ์)',
      solution: '', counselorId: counselor, followUp: '', status: 'ติดตามผล'
    }, context.user.id);
    var saved = SheetRepository.update(SHEET, record.id, {
      counselingId: counseling.id, status: record.status === FIRST || record.status === 'รับเรื่องแล้ว' ? 'กำลังให้คำปรึกษา' : record.status,
      assigneeId: record.assigneeId || counselor
    }, data.version, context.user.id);
    AuditService.write('CONCERN_TO_COUNSELING', SHEET, record.id, { counselingId: counseling.id }, context.user.id);
    return { counselingId: counseling.id, already: false, row: staffRow(saved, directory()) };
  }

  return { page: page, pageData: pageData, submit: submit, track: track, followUp: followUp, inbox: inbox, update: update, reply: reply,
    toCounseling: toCounseling, getConfig: getConfig, saveConfig: saveConfig, dashboardSummary: dashboardSummary, detectLevel: detectLevel, publicUrl: publicUrl };
})();
