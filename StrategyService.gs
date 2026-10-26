// แผนกลยุทธ์ของโรงเรียน: TOWS → วิสัยทัศน์ → พันธกิจ → เป้าประสงค์ → กลยุทธ์ → โครงการ
// - ทุกขั้นเก็บในตาราง StrategyItems (level แยกขั้น) และเชื่อมกับขั้นก่อนหน้าด้วย parentIds
//   พันธกิจ → วิสัยทัศน์ · เป้าประสงค์ → พันธกิจ · กลยุทธ์ → เป้าประสงค์ (จึงรู้ว่าสอดคล้องกับพันธกิจใด) และอ้างรหัส TOWS ใน sourceCodes
// - AI ร่างทีละขั้นจากผลขั้นที่ยืนยันแล้ว ผู้รับผิดชอบแก้/เลือกแล้ว "ยืนยัน" ขั้นที่ยืนยันแล้วแก้ไม่ได้จนกว่าจะยกเลิกการยืนยัน
// - ตรวจความเชื่อมโยงของแผน: พันธกิจที่ไม่มีเป้าประสงค์ กลยุทธ์ที่ไม่มีโครงการ ประเด็นมาตรฐานหรือ Needs ระดับสูงที่ยังไม่มีโครงการตอบ ฯลฯ
var StrategyService = (function () {
  'use strict';

  var STAGES = ['tows', 'vision', 'mission', 'goal', 'strategy'];
  var STAGE_NAMES = { tows: 'กลยุทธ์ TOWS', vision: 'วิสัยทัศน์', mission: 'พันธกิจ', goal: 'เป้าประสงค์', strategy: 'กลยุทธ์', projects: 'โครงการ' };
  var PARENT = { mission: 'vision', goal: 'mission', strategy: 'goal' };
  var CODE_PREFIX = { vision: 'วิสัยทัศน์', mission: 'พันธกิจที่ ', goal: 'เป้าประสงค์ที่ ', strategy: 'กลยุทธ์ที่ ' };
  var AI_KEY = { mission: 'M', goal: 'G', strategy: 'K' };
  var TOWS_TYPES = ['SO', 'WO', 'ST', 'WT'];
  var TOWS_NAMES = { SO: 'กลยุทธ์เชิงรุก (SO)', WO: 'กลยุทธ์เชิงแก้ไข (WO)', ST: 'กลยุทธ์เชิงป้องกัน (ST)', WT: 'กลยุทธ์เชิงรับ (WT)' };
  var MAX_ITEMS = { tows: 32, vision: 1, mission: 10, goal: 20, strategy: 15 };
  var MAX_TEXT = 1000;

  function fail(code, message, fields) { return SheetRepository.serviceError(code, message, fields); }
  function clip(value, size) { return String(value === undefined || value === null ? '' : value).replace(/[ \t]+/g, ' ').trim().slice(0, size); }
  function list(value) {
    return (Array.isArray(value) ? value : String(value || '').split(',')).map(function (item) { return String(item || '').trim(); }).filter(Boolean);
  }
  function canManage(context) { return Core.hasPermission(context.permissions, 'swot.edit'); }

  function itemsOf(yearId, level) {
    return SheetRepository.all('StrategyItems').filter(function (row) { return String(row.academicYearId) === String(yearId) && (!level || row.level === level); })
      .sort(function (a, b) { return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0); });
  }
  function stagesOf(yearId) {
    var plan = SwotService.planOf(yearId);
    try { return JSON.parse((plan && plan.stagesJson) || '{}') || {}; } catch (error) { return {}; }
  }
  function confirmed(stages, stage) { return !!(stages[stage] && stages[stage].at); }
  function previousStage(stage) { return STAGES[STAGES.indexOf(stage) - 1] || ''; }
  function stageOf(input) {
    var stage = String((input && (input.stage || input.level)) || '');
    if (STAGES.indexOf(stage) === -1) throw fail('VALIDATION_ERROR', 'ไม่พบขั้นของแผนที่ระบุ');
    return stage;
  }
  function projectsOf(yearId) {
    return SheetRepository.all('Projects').filter(function (row) { return String(row.academicYearId) === String(yearId); });
  }

  // ---------- ตรวจความเชื่อมโยงของแผน ----------
  function coherence(yearId, analysis) {
    var items = itemsOf(yearId);
    var projects = projectsOf(yearId).filter(function (row) { return row.status !== 'ยกเลิก'; });
    var by = function (level) { return items.filter(function (row) { return row.level === level; }); };
    var childrenOf = function (level, id) { return by(level).filter(function (row) { return list(row.parentIds).indexOf(String(id)) !== -1; }); };
    var checks = [];
    var add = function (ok, text, detail) { checks.push({ ok: ok, text: text, detail: detail || [] }); };
    var names = function (rows) { return rows.map(function (row) { return row.code || row.text; }); };
    var tows = by('tows');
    add(tows.length > 0, tows.length ? 'มีกลยุทธ์ TOWS ' + tows.length + ' ข้อ' : 'ยังไม่มีกลยุทธ์ TOWS');
    add(by('vision').length === 1, by('vision').length ? 'มีวิสัยทัศน์แล้ว' : 'ยังไม่มีวิสัยทัศน์');
    var missions = by('mission');
    var lonelyMissions = missions.filter(function (row) { return !childrenOf('goal', row.id).length; });
    add(missions.length > 0 && !lonelyMissions.length, missions.length ? (lonelyMissions.length ? 'พันธกิจที่ยังไม่มีเป้าประสงค์รองรับ' : 'พันธกิจทุกข้อมีเป้าประสงค์รองรับ') : 'ยังไม่มีพันธกิจ', names(lonelyMissions));
    var goals = by('goal');
    var lonelyGoals = goals.filter(function (row) { return !childrenOf('strategy', row.id).length; });
    add(goals.length > 0 && !lonelyGoals.length, goals.length ? (lonelyGoals.length ? 'เป้าประสงค์ที่ยังไม่มีกลยุทธ์รองรับ' : 'เป้าประสงค์ทุกข้อมีกลยุทธ์รองรับ') : 'ยังไม่มีเป้าประสงค์', names(lonelyGoals));
    var strategies = by('strategy');
    var noProject = strategies.filter(function (row) { return !projects.some(function (project) { return String(project.strategyId) === String(row.id); }); });
    add(strategies.length > 0 && !noProject.length, strategies.length ? (noProject.length ? 'กลยุทธ์ที่ยังไม่มีโครงการ' : 'กลยุทธ์ทุกข้อมีโครงการรองรับ') : 'ยังไม่มีกลยุทธ์', names(noProject));
    var usedTows = {};
    strategies.forEach(function (row) { list(row.sourceCodes).forEach(function (code) { usedTows[code] = true; }); });
    var unusedTows = tows.filter(function (row) { return !usedTows[row.code]; });
    if (strategies.length) add(!unusedTows.length, unusedTows.length ? 'กลยุทธ์ TOWS ที่ยังไม่ถูกนำไปใช้ในกลยุทธ์ใด' : 'กลยุทธ์ TOWS ถูกนำไปใช้ครบ', names(unusedTows));
    // มาตรฐาน: ประเด็นหลักที่ยังไม่มีโครงการตอบ
    var covered = {};
    projects.forEach(function (project) { list(project.mainIssues).forEach(function (code) { covered[code] = true; }); });
    var missing = [];
    APP_CONFIG.QA_STANDARDS.forEach(function (standard) {
      standard.issues.forEach(function (issue) { if (!covered[issue.code]) missing.push(issue.code + ' ' + issue.name); });
    });
    if (projects.length) add(!missing.length, missing.length ? 'ประเด็นพิจารณาของมาตรฐานที่ยังไม่มีโครงการตอบ' : 'โครงการครอบคลุมทุกประเด็นพิจารณาของมาตรฐาน', missing);
    // Needs ระดับสูง/สูงมาก ที่ยังไม่มีโครงการตอบประเด็นหลักนั้น
    var needs = analysis ? analysis.needs.ranked.filter(function (item) { return item.level === 'สูงมาก' || item.level === 'สูง'; }) : [];
    var unmet = needs.filter(function (item) { return !covered[item.mainIssue]; });
    if (needs.length && projects.length) add(!unmet.length, unmet.length ? 'ความต้องการจำเป็นระดับสูงที่ยังไม่มีโครงการตอบ' : 'ความต้องการจำเป็นระดับสูงมีโครงการรองรับทั้งหมด',
      unmet.map(function (item) { return item.code + ' ' + item.item + ' (PNI ' + item.pni + ')'; }));
    // ตำแหน่งในกราฟไข่แดงเน้นกลยุทธ์แบบใด
    if (analysis && analysis.quadrant.focus && tows.length) {
      var focus = analysis.quadrant.focus;
      var hasFocus = tows.some(function (row) { return String(row.code).indexOf(focus) === 0; });
      add(hasFocus, hasFocus ? 'มีกลยุทธ์ ' + focus + ' ตามตำแหน่งในกราฟ (' + analysis.quadrant.name + ')' : 'ตำแหน่งในกราฟแนะนำกลยุทธ์ ' + focus + ' แต่ยังไม่มีในตาราง TOWS');
    }
    return checks;
  }

  function summaryOf(analysis) {
    if (!analysis) return null;
    var factors = {};
    Object.keys(analysis.factors).forEach(function (key) {
      factors[key] = analysis.factors[key].map(function (item) { return { code: item.code, issue: item.issue, average: item.average, count: item.count }; });
    });
    return { quadrant: analysis.quadrant, x: analysis.x, y: analysis.y, S: analysis.S, W: analysis.W, O: analysis.O, T: analysis.T,
      respondentCount: analysis.respondentCount, factors: factors, needs: analysis.needs.ranked.slice(0, 20), needsByStandard: analysis.needs.byStandard };
  }

  // ข้อมูลหน้า TOWS / ทิศทางโรงเรียน
  function page(token, input) {
    var context = AuthService.requirePermission(token, 'swot.view');
    var yearId = SwotService.yearOf(input);
    var manage = canManage(context);
    var analysis = manage ? SwotService.analyze(yearId) : null;
    var stages = stagesOf(yearId);
    var projects = projectsOf(yearId);
    var settings = SettingsService.getPublicSettings();
    return {
      academicYearId: yearId, canManage: manage, canPublish: Core.hasPermission(context.permissions, 'settings.edit'),
      stages: STAGES.map(function (stage) {
        return { key: stage, name: STAGE_NAMES[stage], confirmed: confirmed(stages, stage), at: stages[stage] ? stages[stage].at : '', by: stages[stage] ? stages[stage].by : '',
          count: itemsOf(yearId, stage).length };
      }),
      items: itemsOf(yearId).map(function (row) {
        return { id: row.id, level: row.level, code: row.code, text: row.text, parentIds: list(row.parentIds), sourceCodes: list(row.sourceCodes),
          standards: list(row.standards), kpi: row.kpi || '', target: row.target || '', note: row.note || '' };
      }),
      analysis: summaryOf(analysis),
      projects: projects.map(function (row) {
        return { id: row.id, code: row.code, name: row.name, strategyId: row.strategyId, standard: row.standard, mainIssues: list(row.mainIssues),
          subIssues: list(row.subIssues), budget: Number(row.budget) || 0, status: row.status, responsibleId: row.responsibleId };
      }),
      reports: SheetRepository.all('ProjectReports').filter(function (row) { return String(row.academicYearId) === yearId; }).map(function (row) {
        return { id: row.id, projectId: row.projectId, result: row.result, budgetUsed: Number(row.budgetUsed) || 0, quantStatus: row.quantStatus, qualStatus: row.qualStatus };
      }),
      checks: coherence(yearId, analysis),
      published: { vision: settings.schoolVision || '', mission: settings.schoolMission || '', goals: settings.schoolGoals || '' },
      standards: APP_CONFIG.QA_STANDARDS,
      towsNames: TOWS_NAMES
    };
  }

  // ---------- บันทึกรายการของขั้น (แทนทั้งขั้น เก็บรหัสเดิมไว้เพื่อให้โครงการที่ผูกกลยุทธ์ไม่หลุด) ----------
  function saveItems(token, input) {
    var context = AuthService.requirePermission(token, 'swot.edit');
    var payload = input || {};
    var yearId = SwotService.yearOf(payload);
    var stage = stageOf(payload);
    var stages = stagesOf(yearId);
    if (confirmed(stages, stage)) throw fail('VALIDATION_ERROR', 'ขั้น' + STAGE_NAMES[stage] + 'ยืนยันแล้ว กรุณายกเลิกการยืนยันก่อนแก้ไข');
    var prev = previousStage(stage);
    if (prev && !confirmed(stages, prev)) throw fail('VALIDATION_ERROR', 'กรุณายืนยันขั้น' + STAGE_NAMES[prev] + 'ก่อน');
    var incoming = Array.isArray(payload.items) ? payload.items : [];
    if (incoming.length > MAX_ITEMS[stage]) throw fail('VALIDATION_ERROR', 'ขั้นนี้มีได้ไม่เกิน ' + MAX_ITEMS[stage] + ' ข้อ');
    var current = itemsOf(yearId, stage);
    var currentById = {};
    current.forEach(function (row) { currentById[row.id] = row; });
    var parents = PARENT[stage] ? itemsOf(yearId, PARENT[stage]) : [];
    var parentIds = parents.map(function (row) { return String(row.id); });
    var errors = {};
    var counters = {};
    var now = Core.nowIso();
    var records = incoming.map(function (item, index) {
      var text = clip(item && item.text, MAX_TEXT);
      if (!text) { errors['items.' + index] = 'กรุณากรอกข้อความ'; return null; }
      var values = { academicYearId: yearId, level: stage, text: text, sortOrder: index + 1, kpi: clip(item.kpi, 1000), target: clip(item.target, 500),
        note: clip(item.note, 500), standards: list(item.standards).filter(function (name) { return APP_CONFIG.QA_STANDARD_NAMES.indexOf(name) !== -1; }).join(',') };
      if (stage === 'tows') {
        var type = TOWS_TYPES.indexOf(item.type) !== -1 ? item.type : '';
        if (!type) { errors['items.' + index] = 'กรุณาเลือกประเภท SO/WO/ST/WT'; return null; }
        counters[type] = (counters[type] || 0) + 1;
        values.code = type + counters[type];
        values.sourceCodes = list(item.sourceCodes).filter(function (code) { return /^[SWOTN]\d{1,3}$/.test(code); }).join(',');
        values.parentIds = '';
      } else {
        values.code = stage === 'vision' ? CODE_PREFIX.vision : CODE_PREFIX[stage] + (index + 1);
        var ids = stage === 'mission' ? parentIds.slice(0, 1) : list(item.parentIds).filter(function (id) { return parentIds.indexOf(id) !== -1; });
        if (PARENT[stage] && !ids.length) { errors['items.' + index] = 'กรุณาเลือก' + STAGE_NAMES[PARENT[stage]] + 'ที่ข้อนี้สอดคล้อง'; return null; }
        values.parentIds = ids.join(',');
        values.sourceCodes = stage === 'strategy' ? list(item.sourceCodes).filter(function (code) { return /^(SO|WO|ST|WT)\d{1,2}$/.test(code); }).join(',') : '';
      }
      var existing = item.id && currentById[item.id];
      if (existing) {
        delete currentById[item.id];
        return Object.assign({}, existing, values, { updatedAt: now, updatedBy: context.user.id, version: Number(existing.version) + 1 });
      }
      return Core.createRecord(values, context.user.id);
    });
    if (!Core.isEmptyObject(errors)) throw fail('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูล', errors);
    var removed = Object.keys(currentById);
    if (stage === 'strategy') {
      var used = projectsOf(yearId).filter(function (project) { return removed.indexOf(String(project.strategyId)) !== -1; });
      if (used.length) throw fail('VALIDATION_ERROR', 'ลบกลยุทธ์ที่มีโครงการผูกอยู่ไม่ได้ (' + used.length + ' โครงการ) กรุณาย้ายโครงการไปกลยุทธ์อื่นก่อน');
    }
    SheetRepository.replaceRows('StrategyItems', function (row) { return String(row.academicYearId) === yearId && row.level === stage; }, records);
    AuditService.write('STRATEGY_SAVE', 'StrategyItems', yearId, { stage: stage, count: records.length }, context.user.id);
    return { stage: stage, count: records.length };
  }

  function confirm(token, input) {
    var context = AuthService.requirePermission(token, 'swot.edit');
    var payload = input || {};
    var yearId = SwotService.yearOf(payload);
    var stage = stageOf(payload);
    var stages = stagesOf(yearId);
    var yes = payload.confirmed !== false;
    if (yes) {
      var prev = previousStage(stage);
      if (prev && !confirmed(stages, prev)) throw fail('VALIDATION_ERROR', 'กรุณายืนยันขั้น' + STAGE_NAMES[prev] + 'ก่อน');
      var items = itemsOf(yearId, stage);
      if (!items.length) throw fail('VALIDATION_ERROR', 'ยังไม่มีรายการในขั้น' + STAGE_NAMES[stage]);
      if (stage === 'mission') {
        // ทุกพันธกิจต้องมาจากวิสัยทัศน์ปัจจุบัน
        var vision = itemsOf(yearId, 'vision')[0];
        if (items.some(function (row) { return list(row.parentIds).indexOf(String(vision && vision.id)) === -1; })) throw fail('VALIDATION_ERROR', 'กรุณาบันทึกพันธกิจอีกครั้งเพื่อเชื่อมกับวิสัยทัศน์ปัจจุบัน');
      }
      if (stage === 'goal') {
        var missions = itemsOf(yearId, 'mission');
        var lonely = missions.filter(function (mission) { return !items.some(function (goal) { return list(goal.parentIds).indexOf(String(mission.id)) !== -1; }); });
        if (lonely.length) throw fail('VALIDATION_ERROR', 'ทุกพันธกิจต้องมีเป้าประสงค์อย่างน้อย 1 ข้อ (ยังขาด: ' + lonely.map(function (row) { return row.code; }).join(', ') + ')');
      }
      if (stage === 'strategy') {
        var goals = itemsOf(yearId, 'goal');
        var missing = goals.filter(function (goal) { return !items.some(function (row) { return list(row.parentIds).indexOf(String(goal.id)) !== -1; }); });
        if (missing.length) throw fail('VALIDATION_ERROR', 'ทุกเป้าประสงค์ต้องมีกลยุทธ์รองรับ (ยังขาด: ' + missing.map(function (row) { return row.code; }).join(', ') + ')');
      }
      stages[stage] = { at: Core.nowIso(), by: context.user.displayName || context.user.username };
    } else {
      var next = STAGES[STAGES.indexOf(stage) + 1];
      if (next && confirmed(stages, next)) throw fail('VALIDATION_ERROR', 'กรุณายกเลิกการยืนยันขั้น' + STAGE_NAMES[next] + 'ก่อน');
      delete stages[stage];
    }
    SwotService.savePlan(yearId, { stagesJson: JSON.stringify(stages) }, context.user.id);
    AuditService.write(yes ? 'STRATEGY_CONFIRM' : 'STRATEGY_UNCONFIRM', 'StrategyPlans', yearId, { stage: stage }, context.user.id);
    return { stage: stage, confirmed: yes };
  }

  // ---------- AI ร่างทีละขั้น ----------
  function aiCall(context, system, prompt, maxTokens) {
    return SwotService.parseJson(AiService.run(context, 'swot', SwotService.EXPERT + ' ' + system, [{ role: 'user', text: prompt }],
      { maxTokens: maxTokens || 3500, temperature: 0.5 }).text);
  }
  function arrayOf(value, key) { return Array.isArray(value) ? value : value && Array.isArray(value[key]) ? value[key] : []; }

  function aiDraft(token, input) {
    var context = AuthService.requirePermission(token, 'swot.edit');
    var payload = input || {};
    var yearId = SwotService.yearOf(payload);
    var stage = String(payload.stage || '');
    if (STAGES.indexOf(stage) === -1 && stage !== 'projects') throw fail('VALIDATION_ERROR', 'ไม่พบขั้นของแผนที่ระบุ');
    var stages = stagesOf(yearId);
    var prev = stage === 'projects' ? 'strategy' : previousStage(stage);
    if (prev && !confirmed(stages, prev)) throw fail('VALIDATION_ERROR', 'กรุณายืนยันขั้น' + STAGE_NAMES[prev] + 'ก่อนให้ AI ร่างขั้นถัดไป');
    var analysis = SwotService.analyze(yearId);
    if (stage === 'tows' && !analysis.respondentCount) throw fail('VALIDATION_ERROR', 'ยังไม่มีผู้ตอบแบบสอบถาม SWOT');
    var summary = summaryOf(analysis);
    var hint = clip(payload.hint, 500);
    var keyed = function (level) {
      return itemsOf(yearId, level).map(function (row, index) { return { key: (AI_KEY[level] || '') + (index + 1), id: row.id, code: row.code, text: row.text, parentIds: list(row.parentIds), sourceCodes: list(row.sourceCodes) }; });
    };
    var context2 = { swot: { quadrant: summary.quadrant, x: summary.x, y: summary.y, factors: summary.factors }, needs: summary.needs.slice(0, 12),
      needsByStandard: summary.needsByStandard };
    var tows = itemsOf(yearId, 'tows').map(function (row) { return { code: row.code, text: row.text, sources: list(row.sourceCodes) }; });
    var vision = itemsOf(yearId, 'vision').map(function (row) { return row.text; })[0] || '';
    var note = hint ? '\nข้อเสนอเพิ่มเติมจากผู้ใช้: ' + hint : '';
    var result;
    if (stage === 'tows') {
      result = aiCall(context, 'สร้างกลยุทธ์ TOWS Matrix จากผล SWOT แต่ละข้อต้องจับคู่ปัจจัยจริงจากรายการ (SO = จุดแข็ง+โอกาส, WO = จุดอ่อน+โอกาส, ST = จุดแข็ง+อุปสรรค, WT = จุดอ่อน+อุปสรรค) ' +
        'และอาจอ้างความต้องการจำเป็น (N) ที่เกี่ยวข้อง ให้ประเภทละ 2–4 ข้อ เน้นประเภทตามตำแหน่งในกราฟไข่แดง (quadrant.focus) มากกว่าประเภทอื่น ' +
        'แต่ละข้อขึ้นต้นด้วยคำกริยา เช่น พัฒนา ส่งเสริม ยกระดับ ตอบเป็น JSON เท่านั้น รูปแบบ {"items":[{"type":"SO","text":"...","sources":["S1","O2"]}]}',
        'ข้อมูล (JSON):\n' + JSON.stringify(context2) + note);
      return { stage: stage, items: arrayOf(result, 'items').map(function (item) {
        return { type: TOWS_TYPES.indexOf(String(item.type)) !== -1 ? item.type : '', text: clip(item.text, MAX_TEXT), sourceCodes: list(item.sources).filter(function (code) { return /^[SWOTN]\d{1,3}$/.test(code); }) };
      }).filter(function (item) { return item.type && item.text; }) };
    }
    if (stage === 'vision') {
      result = aiCall(context, 'เสนอวิสัยทัศน์ของโรงเรียน 3 ทางเลือก แต่ละข้อเป็นประโยคเดียว ระบุภาพอนาคตที่ชัดเจน มีกรอบเวลา (เช่น ภายในปี 25xx) สะท้อนกลยุทธ์ TOWS และความต้องการจำเป็นสำคัญ ' +
        'อ่านแล้วจำง่าย ไม่ยาวเกิน 2 บรรทัด พร้อมเหตุผลสั้น ๆ ตอบเป็น JSON เท่านั้น {"items":[{"text":"...","reason":"..."}]}',
        'ข้อมูล (JSON):\n' + JSON.stringify({ tows: tows, needs: context2.needs, quadrant: summary.quadrant, currentVision: SettingsService.getPublicSettings().schoolVision || '' }) + note, 2000);
      return { stage: stage, items: arrayOf(result, 'items').map(function (item) { return { text: clip(item.text, MAX_TEXT), reason: clip(item.reason, 400) }; }).filter(function (item) { return item.text; }).slice(0, 3) };
    }
    if (stage === 'mission') {
      result = aiCall(context, 'เขียนพันธกิจ 4–6 ข้อที่ทำให้วิสัยทัศน์เป็นจริง แต่ละข้อขึ้นต้นด้วยคำกริยา ครอบคลุมด้านผู้เรียน ครู การบริหาร และการมีส่วนร่วม ' +
        'สอดคล้องกับมาตรฐานการศึกษา 3 มาตรฐาน พร้อมเหตุผลว่ามาจากส่วนใดของวิสัยทัศน์หรือ TOWS ตอบเป็น JSON เท่านั้น {"items":[{"text":"...","reason":"...","standards":["มาตรฐานที่ 1 คุณภาพของผู้เรียน"]}]}',
        'วิสัยทัศน์: ' + vision + '\nTOWS: ' + JSON.stringify(tows) + '\nมาตรฐาน: ' + JSON.stringify(APP_CONFIG.QA_STANDARD_NAMES) + note, 2500);
      return { stage: stage, items: arrayOf(result, 'items').map(function (item) {
        return { text: clip(item.text, MAX_TEXT), reason: clip(item.reason, 400), standards: list(item.standards).filter(function (name) { return APP_CONFIG.QA_STANDARD_NAMES.indexOf(name) !== -1; }) };
      }).filter(function (item) { return item.text; }).slice(0, MAX_ITEMS.mission) };
    }
    if (stage === 'goal') {
      var missions = keyed('mission');
      result = aiCall(context, 'เขียนเป้าประสงค์ที่บรรลุพันธกิจ อย่างน้อยพันธกิจละ 1 ข้อ แต่ละข้อบอกผลลัพธ์ที่ต้องการ พร้อมตัวชี้วัดแบบ SMART และค่าเป้าหมายเป็นตัวเลข ' +
        'missions ให้ใส่ key ของพันธกิจที่ข้อนี้รองรับ ตอบเป็น JSON เท่านั้น {"items":[{"text":"...","missions":["M1"],"kpi":"...","target":"ร้อยละ 80"}]}',
        'พันธกิจ: ' + JSON.stringify(missions.map(function (row) { return { key: row.key, text: row.text }; })) + '\nความต้องการจำเป็นสำคัญ: ' + JSON.stringify(context2.needs) + note, 3000);
      var missionByKey = {};
      missions.forEach(function (row) { missionByKey[row.key] = row.id; });
      return { stage: stage, items: arrayOf(result, 'items').map(function (item) {
        return { text: clip(item.text, MAX_TEXT), parentIds: list(item.missions).map(function (key) { return missionByKey[key]; }).filter(Boolean), kpi: clip(item.kpi, 1000), target: clip(item.target, 500) };
      }).filter(function (item) { return item.text; }).slice(0, MAX_ITEMS.goal) };
    }
    if (stage === 'strategy') {
      var goals = keyed('goal');
      var missionRows = keyed('mission');
      result = aiCall(context, 'กำหนดกลยุทธ์ 4–8 ข้อที่นำไปสู่เป้าประสงค์ แต่ละข้อต้องสอดคล้องกับพันธกิจ (ผ่านเป้าประสงค์) และอ้างกลยุทธ์ TOWS ที่เป็นที่มา ' +
        'goals = key ของเป้าประสงค์ที่กลยุทธ์นี้รองรับ (ทุกเป้าประสงค์ต้องมีกลยุทธ์อย่างน้อย 1 ข้อ) tows = รหัส TOWS standards = มาตรฐานที่เกี่ยวข้อง ' +
        'ตอบเป็น JSON เท่านั้น {"items":[{"text":"...","goals":["G1"],"tows":["SO1"],"standards":["มาตรฐานที่ 1 คุณภาพของผู้เรียน"]}]}',
        'พันธกิจ: ' + JSON.stringify(missionRows.map(function (row) { return { key: row.key, text: row.text }; })) +
        '\nเป้าประสงค์: ' + JSON.stringify(goals.map(function (row) {
          return { key: row.key, text: row.text, missions: row.parentIds.map(function (id) { var mission = missionRows.filter(function (m) { return m.id === id; })[0]; return mission ? mission.key : ''; }) };
        })) + '\nTOWS: ' + JSON.stringify(tows) + '\nมาตรฐาน: ' + JSON.stringify(APP_CONFIG.QA_STANDARD_NAMES) + note, 3000);
      var goalByKey = {};
      goals.forEach(function (row) { goalByKey[row.key] = row.id; });
      var towsCodes = tows.map(function (row) { return row.code; });
      return { stage: stage, items: arrayOf(result, 'items').map(function (item) {
        return { text: clip(item.text, MAX_TEXT), parentIds: list(item.goals).map(function (key) { return goalByKey[key]; }).filter(Boolean),
          sourceCodes: list(item.tows).filter(function (code) { return towsCodes.indexOf(code) !== -1; }),
          standards: list(item.standards).filter(function (name) { return APP_CONFIG.QA_STANDARD_NAMES.indexOf(name) !== -1; }) };
      }).filter(function (item) { return item.text; }).slice(0, MAX_ITEMS.strategy) };
    }
    // โครงการตามกลยุทธ์
    var strategies = keyed('strategy');
    if (payload.strategyId) strategies = strategies.filter(function (row) { return row.id === String(payload.strategyId); });
    if (!strategies.length) throw fail('VALIDATION_ERROR', 'ไม่พบกลยุทธ์');
    var existing = projectsOf(yearId).map(function (row) { return row.name; });
    var standards = APP_CONFIG.QA_STANDARDS.map(function (standard) {
      return { name: standard.name, issues: standard.issues.map(function (issue) { return { code: issue.code, name: issue.name, subs: issue.subs.map(function (sub) { return sub.code + ' ' + sub.name; }) }; }) };
    });
    result = aiCall(context, 'เสนอโครงการในแผนปฏิบัติการประจำปีที่ทำได้จริงในโรงเรียน กลยุทธ์ละ 1–3 โครงการ แต่ละโครงการต้องระบุมาตรฐาน ประเด็นหลัก (เช่น 1.1) และประเด็นรอง (เช่น 1.1.1 ถ้ามี) ที่ตอบ ' +
      'เน้นตอบความต้องการจำเป็นระดับสูงก่อน วัตถุประสงค์และเป้าหมายต้องวัดได้ กิจกรรมเขียนตามวงจร PDCA งบประมาณประมาณการเป็นตัวเลขบาท ไม่ซ้ำกับโครงการเดิม ' +
      'strategy = key ของกลยุทธ์ department ต้องเป็นหนึ่งใน ' + JSON.stringify(['บริหารงานวิชาการ', 'บริหารงานงบประมาณ', 'บริหารงานบุคคล', 'บริหารงานทั่วไป']) + ' ' +
      'ตอบเป็น JSON เท่านั้น {"items":[{"strategy":"K1","name":"...","standard":"มาตรฐานที่ 1 คุณภาพของผู้เรียน","mainIssues":["1.1"],"subIssues":["1.1.1"],' +
      '"department":"...","rationale":"...","objectives":"...","targetQuantity":"...","targetQuality":"...","activities":"...","kpi":"...","expected":"...","budget":10000}]}',
      'กลยุทธ์: ' + JSON.stringify(strategies.map(function (row) { return { key: row.key, text: row.text, tows: row.sourceCodes }; })) +
      '\nความต้องการจำเป็น (เรียงตาม PNI): ' + JSON.stringify(context2.needs) + '\nมาตรฐาน: ' + JSON.stringify(standards) +
      '\nโครงการเดิม: ' + JSON.stringify(existing) + note, 6000);
    var strategyByKey = {};
    strategies.forEach(function (row) { strategyByKey[row.key] = row.id; });
    return { stage: 'projects', items: arrayOf(result, 'items').map(function (item) {
      var standard = APP_CONFIG.QA_STANDARD_NAMES.indexOf(item.standard) !== -1 ? item.standard : '';
      return { strategyId: strategyByKey[item.strategy] || (strategies.length === 1 ? strategies[0].id : ''), name: clip(item.name, 300), standard: standard,
        mainIssues: list(item.mainIssues).join(','), subIssues: list(item.subIssues).join(','),
        department: APP_CONFIG.ENTITIES.projects.fields.filter(function (field) { return field.key === 'department'; })[0].options.indexOf(item.department) !== -1 ? item.department : '',
        rationale: clip(item.rationale, 5000), objectives: clip(item.objectives, 3000), targetQuantity: clip(item.targetQuantity, 2000),
        targetQuality: clip(item.targetQuality, 2000), activities: clip(item.activities, 5000), kpi: clip(item.kpi, 3000), expected: clip(item.expected, 3000),
        budget: Math.max(0, Math.round(Number(item.budget) || 0)) };
    }).filter(function (item) { return item.name && item.strategyId && item.standard; }).slice(0, 30) };
  }

  // เพิ่มโครงการที่เลือกจากร่างของ AI (ผ่านการตรวจเดียวกับการบันทึกในเมนูโครงการ)
  function createProjects(token, input) {
    AuthService.requirePermission(token, 'swot.edit');
    var payload = input || {};
    var yearId = SwotService.yearOf(payload);
    var items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 30);
    if (!items.length) throw fail('VALIDATION_ERROR', 'กรุณาเลือกโครงการอย่างน้อย 1 โครงการ');
    var created = [];
    var errors = [];
    var count = projectsOf(yearId).length;
    items.forEach(function (item, index) {
      var values = Object.assign({}, item, { academicYearId: yearId, status: 'เสนอโครงการ', fileId: '' });
      if (!values.code) values.code = 'P' + String(count + created.length + 1).padStart(2, '0');
      try {
        created.push(EntityService.save(token, { entity: 'projects', values: values }).id);
      } catch (error) {
        errors.push({ index: index, name: item && item.name, message: error.message, fieldErrors: error.fieldErrors || error.fields || null });
      }
    });
    return { created: created.length, ids: created, errors: errors };
  }

  // เผยแพร่วิสัยทัศน์ พันธกิจ เป้าประสงค์ที่ยืนยันแล้วขึ้นหน้าแรกของเว็บโรงเรียน
  function publish(token, input) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    var yearId = SwotService.yearOf(input);
    var stages = stagesOf(yearId);
    ['vision', 'mission', 'goal'].forEach(function (stage) {
      if (!confirmed(stages, stage)) throw fail('VALIDATION_ERROR', 'กรุณายืนยันขั้น' + STAGE_NAMES[stage] + 'ก่อนเผยแพร่');
    });
    var text = function (level) { return itemsOf(yearId, level).map(function (row) { return row.text; }).join('\n'); };
    SettingsService.saveLanding(token, { schoolVision: text('vision'), schoolMission: text('mission'), schoolGoals: text('goal') });
    AuditService.write('STRATEGY_PUBLISH', 'Settings', yearId, {}, context.user.id);
    return { ok: true };
  }

  // AI เรียบเรียงรายงานผลโครงการเป็นภาษาราชการ (เฉพาะช่องที่มีข้อความ ไม่เพิ่มข้อเท็จจริง)
  var REPORT_FIELDS = ['activitiesDone', 'quantResult', 'qualResult', 'outcome', 'problems', 'suggestions'];
  function polishReport(token, input) {
    var context = AuthService.requirePermission(token, 'project.view');
    var values = (input && input.values) || {};
    var source = {};
    REPORT_FIELDS.forEach(function (key) { var text = clip(values[key], 3000); if (text) source[key] = text; });
    if (!Object.keys(source).length) throw fail('VALIDATION_ERROR', 'กรุณาพิมพ์ข้อความสั้น ๆ ในช่องรายงานก่อน');
    var project = input && input.projectId ? SheetRepository.findById('Projects', input.projectId) : null;
    var feature = AiService.pickFeature(context, ['swot', 'bot']);
    var system = SwotService.EXPERT + ' เรียบเรียงรายงานผลการดำเนินโครงการของโรงเรียนให้เป็นภาษาราชการที่อ่านง่าย คงข้อเท็จจริงและตัวเลขเดิมทั้งหมด ห้ามเพิ่มข้อมูลที่ไม่มี ' +
      'เรียบเรียงเฉพาะช่องที่ให้มา ตอบเป็น JSON เท่านั้น รูปแบบ {"ชื่อช่อง":"ข้อความ"} ใช้ชื่อช่องเดิม';
    var prompt = (project ? 'โครงการ: ' + project.name + '\nวัตถุประสงค์: ' + clip(project.objectives, 1500) + '\n' : '') + 'ข้อความเดิม (JSON):\n' + JSON.stringify(source);
    var parsed = SwotService.parseJson(AiService.run(context, feature, system, [{ role: 'user', text: prompt }], { maxTokens: 3000, temperature: 0.3 }).text);
    var result = {};
    Object.keys(source).forEach(function (key) { var text = clip(parsed && parsed[key], 3000); if (text) result[key] = text; });
    return { values: result };
  }

  // ข้อมูลให้น้องกลยุทธ์ (ไม่มีชื่อบุคคล)
  function botContext(token, data) {
    var payload = data || {};
    var module = APP_CONFIG.MODULES.filter(function (item) { return item.route === payload.route; })[0] || { name: 'แผนกลยุทธ์' };
    var result = page(token, payload);
    var plan = { stages: result.stages.map(function (stage) { return stage.name + (stage.confirmed ? ' (ยืนยันแล้ว)' : ' (ยังไม่ยืนยัน)') + ' ' + stage.count + ' ข้อ'; }),
      items: result.items.map(function (item) { return { level: STAGE_NAMES[item.level], code: item.code, text: item.text, links: item.sourceCodes, kpi: item.kpi, target: item.target }; }),
      projects: result.projects.map(function (project) { return { code: project.code, name: project.name, standard: project.standard, mainIssues: project.mainIssues, budget: project.budget, status: project.status }; }),
      reports: result.reports.map(function (report) { return { result: report.result, budgetUsed: report.budgetUsed }; }),
      checks: result.checks.map(function (check) { return (check.ok ? '✓ ' : '✗ ') + check.text + (check.detail.length ? ': ' + check.detail.slice(0, 8).join(', ') : ''); }) };
    var text = 'หน้า: ' + module.name + '\nผลวิเคราะห์ SWOT และ Needs (JSON' + (result.analysis ? '' : ' — ผู้ถามไม่มีสิทธิ์ดูผลวิเคราะห์') + '):\n' +
      JSON.stringify(result.analysis || {}).slice(0, 25000) + '\nแผนกลยุทธ์และโครงการ (JSON):\n' + JSON.stringify(plan).slice(0, 30000);
    return { title: module.name, total: null, shown: null, text: text };
  }

  return { page: page, saveItems: saveItems, confirm: confirm, aiDraft: aiDraft, createProjects: createProjects, publish: publish,
    polishReport: polishReport, botContext: botContext, coherence: coherence, STAGES: STAGES, STAGE_NAMES: STAGE_NAMES };
})();
