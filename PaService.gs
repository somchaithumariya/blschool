// ประเมินผลการปฏิบัติงาน ว.23: ครูประเมินตนเอง + กรรมการ 3 คนให้คะแนนผ่านบัญชีในระบบ (ระดับ 1–4 ต่อข้อ)
// คะแนนแต่ละกลุ่ม = (ค่าเฉลี่ยระดับของกรรมการที่ส่งแล้ว / 4) × คะแนนเต็มของกลุ่ม ตามแบบประเมินของตำแหน่ง/วิทยฐานะ
var PaService = (function () {
  'use strict';

  var ROLES = [['self', 'ผู้รับการประเมิน (ประเมินตนเอง)', 'teacherId'], ['c1', 'ประธานกรรมการ', 'committee1Id'],
    ['c2', 'กรรมการคนที่ 2', 'committee2Id'], ['c3', 'กรรมการคนที่ 3', 'committee3Id']];
  var COMMITTEE = ['c1', 'c2', 'c3'];

  function template(name) {
    return APP_CONFIG.PA_TEMPLATES.filter(function (item) { return item.name === name; })[0] || APP_CONFIG.PA_TEMPLATES[1];
  }
  function groupOf(componentName) {
    var component = APP_CONFIG.PA_COMPONENTS.filter(function (item) { return item.name === componentName; })[0];
    return component ? component.group : 'standard';
  }
  function levelOf(total) {
    return total >= 90 ? 'ดีเด่น' : total >= 80 ? 'ดีมาก' : total >= 70 ? 'ดี' : total >= 60 ? 'พอใช้' : 'ต้องปรับปรุง';
  }

  function criteriaFor(templateName) {
    var order = APP_CONFIG.PA_COMPONENTS.map(function (item) { return item.name; });
    return SheetRepository.all('PaCriteria').filter(function (row) { return row.template === templateName; })
      .sort(function (a, b) { return order.indexOf(a.component) - order.indexOf(b.component) || Number(a.sortNo) - Number(b.sortNo); })
      .map(function (row) { return { id: row.id, component: row.component, group: groupOf(row.component), item: row.item, description: row.description || '', evidence: row.evidence || '' }; });
  }

  function scoresOf(evaluationId) {
    return SheetRepository.all('PaScores').filter(function (row) { return String(row.evaluationId) === String(evaluationId); });
  }
  function parse(row) { try { return JSON.parse(row.scoresJson || '{}') || {}; } catch (error) { return {}; } }

  // บทบาทของผู้ใช้คนนี้ในการประเมินนี้ ('' = ไม่เกี่ยวข้อง)
  function roleIn(evaluation, personnelId) {
    if (!personnelId) return '';
    var match = ROLES.filter(function (role) { return String(evaluation[role[2]]) === String(personnelId); })[0];
    return match ? match[0] : '';
  }

  // สรุปคะแนนรวมจากกรรมการที่ส่งแล้ว (ไม่นับคะแนนประเมินตนเอง)
  function summarize(evaluation, criteria, scoreRows) {
    var tpl = template(evaluation.template);
    var max = { standard: tpl.standard, challenge: tpl.challenge, c2: 10, c3: 10 };
    var submitted = scoreRows.filter(function (row) { return COMMITTEE.indexOf(row.role) !== -1 && row.status === 'submitted'; });
    var groups = {};
    Object.keys(max).forEach(function (group) {
      var items = criteria.filter(function (item) { return item.group === group; });
      if (!items.length || !max[group]) { groups[group] = { max: max[group], score: 0, average: 0 }; return; }
      var averages = submitted.map(function (row) {
        var scores = parse(row);
        var values = items.map(function (item) { return Number(scores[item.id]) || 0; });
        return values.reduce(function (sum, value) { return sum + value; }, 0) / items.length;
      });
      var average = averages.length ? averages.reduce(function (sum, value) { return sum + value; }, 0) / averages.length : 0;
      groups[group] = { max: max[group], average: Math.round(average * 100) / 100, score: Math.round(average / 4 * max[group] * 100) / 100 };
    });
    var total = Math.round(Object.keys(groups).reduce(function (sum, key) { return sum + groups[key].score; }, 0) * 100) / 100;
    var status = submitted.length === 0 ? 'รอประเมิน' : submitted.length < 3 ? 'กำลังประเมิน (' + submitted.length + '/3)' : 'ประเมินแล้ว';
    return { groups: groups, total: submitted.length ? total : '', result: submitted.length === 3 ? levelOf(total) : '', status: status,
      submittedCount: submitted.length };
  }

  function refresh(evaluation, actorId) {
    var summary = summarize(evaluation, criteriaFor(evaluation.template), scoresOf(evaluation.id));
    var current = SheetRepository.findById('PaEvaluations', evaluation.id);
    if (current.status !== summary.status || String(current.totalScore) !== String(summary.total) || current.result !== summary.result) {
      SheetRepository.update('PaEvaluations', current.id, { status: summary.status, totalScore: summary.total, result: summary.result }, current.version, actorId);
    }
    return summary;
  }

  // งานประเมินของฉัน (ในฐานะผู้รับการประเมิน หรือกรรมการ)
  function myTasks(token) {
    var context = AuthService.requirePermission(token, 'paSelf.view');
    var personnelId = context.user.personnelId;
    if (!personnelId) return { linked: false, tasks: [] };
    var names = EntityService.indexBy(SheetRepository.all('Personnel'));
    var titles = EntityService.indexBy(SheetRepository.all('Titles'));
    var years = EntityService.indexBy(SheetRepository.all('AcademicYears'));
    var myScores = {};
    SheetRepository.all('PaScores').forEach(function (row) { if (String(row.personnelId) === String(personnelId)) myScores[row.evaluationId + '|' + row.role] = row; });
    var tasks = [];
    SheetRepository.all('PaEvaluations').forEach(function (evaluation) {
      ROLES.forEach(function (role) {
        if (String(evaluation[role[2]]) !== String(personnelId)) return;
        var teacher = names[evaluation.teacherId] || {};
        var mine = myScores[evaluation.id + '|' + role[0]];
        var year = years[evaluation.academicYearId];
        tasks.push({ evaluationId: evaluation.id, role: role[0], roleName: role[1], round: evaluation.round, year: year ? year.year : '',
          teacherName: ((titles[teacher.titleId] || {}).name || '') + (teacher.firstName || '') + ' ' + (teacher.lastName || ''),
          template: evaluation.template, myStatus: mine ? mine.status : '', evaluationStatus: evaluation.status || 'รอประเมิน',
          totalScore: role[0] === 'self' && evaluation.status !== 'ประเมินแล้ว' ? '' : evaluation.totalScore, result: evaluation.result || '' });
      });
    });
    return { linked: true, tasks: tasks.sort(function (a, b) { return String(b.year + a.round).localeCompare(String(a.year + b.round)); }) };
  }

  function loadEvaluation(id) {
    var evaluation = SheetRepository.findById('PaEvaluations', id);
    if (!evaluation) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบการประเมิน');
    return evaluation;
  }

  // แบบให้คะแนนของฉัน: กรรมการเห็นคะแนนประเมินตนเองของครูด้วย (อ่านอย่างเดียว)
  function getForm(token, data) {
    var context = AuthService.requirePermission(token, 'paSelf.view');
    var evaluation = loadEvaluation(data && data.evaluationId);
    var requested = String((data && data.role) || '');
    var role = ROLES.some(function (item) { return item[0] === requested; }) ? requested : roleIn(evaluation, context.user.personnelId);
    var isAdmin = Core.hasPermission(context.permissions, 'paAdmin.view');
    if (String(evaluation[(ROLES.filter(function (item) { return item[0] === role; })[0] || [])[2]]) !== String(context.user.personnelId) && !isAdmin) {
      throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่ได้เป็นผู้ประเมินหรือผู้รับการประเมินในรายการนี้');
    }
    var rows = scoresOf(evaluation.id);
    var mine = rows.filter(function (row) { return row.role === role; })[0] || null;
    var self = rows.filter(function (row) { return row.role === 'self'; })[0] || null;
    var criteria = criteriaFor(evaluation.template);
    var canEdit = role !== '' && String(evaluation[ROLES.filter(function (item) { return item[0] === role; })[0][2]]) === String(context.user.personnelId) &&
      evaluation.status !== 'ประเมินแล้ว';
    return {
      evaluation: evaluation, role: role, roleName: (ROLES.filter(function (item) { return item[0] === role; })[0] || ['', ''])[1],
      template: template(evaluation.template), criteria: criteria, components: APP_CONFIG.PA_COMPONENTS,
      mine: mine ? { scores: parse(mine), comment: mine.comment, status: mine.status } : { scores: {}, comment: '', status: '' },
      selfScores: role !== 'self' && self && self.status === 'submitted' ? parse(self) : null,
      canEdit: canEdit,
      summary: isAdmin || evaluation.status === 'ประเมินแล้ว' ? summarize(evaluation, criteria, rows) : null
    };
  }

  function saveScore(token, data) {
    var context = AuthService.requirePermission(token, 'paSelf.view');
    var payload = data || {};
    var evaluation = loadEvaluation(payload.evaluationId);
    var role = roleIn(evaluation, context.user.personnelId);
    if (payload.role && ROLES.some(function (item) { return item[0] === payload.role && String(evaluation[item[2]]) === String(context.user.personnelId); })) role = payload.role;
    if (!role) throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่ได้เป็นผู้ประเมินหรือผู้รับการประเมินในรายการนี้');
    if (evaluation.status === 'ประเมินแล้ว') throw SheetRepository.serviceError('VALIDATION_ERROR', 'การประเมินนี้เสร็จสิ้นแล้ว แก้ไขไม่ได้');
    var criteria = criteriaFor(evaluation.template);
    var input = payload.scores || {};
    var scores = {};
    var missing = 0;
    criteria.forEach(function (item) {
      var value = Number(input[item.id]);
      if ([1, 2, 3, 4].indexOf(value) !== -1) scores[item.id] = value; else missing += 1;
    });
    var submit = payload.submit === true;
    if (submit && missing) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาให้ระดับคะแนนให้ครบทุกข้อ (ยังขาด ' + missing + ' ข้อ)');
    var values = { evaluationId: evaluation.id, personnelId: context.user.personnelId, role: role, scoresJson: JSON.stringify(scores),
      comment: String(payload.comment || '').trim().slice(0, 3000), status: submit ? 'submitted' : 'draft' };
    var existing = scoresOf(evaluation.id).filter(function (row) { return row.role === role; })[0];
    if (existing) SheetRepository.update('PaScores', existing.id, values, existing.version, context.user.id);
    else SheetRepository.insert('PaScores', values, context.user.id);
    AuditService.write(submit ? 'PA_SUBMIT' : 'PA_DRAFT', 'PaEvaluations', evaluation.id, { role: role }, context.user.id);
    var summary = refresh(evaluation, context.user.id);
    return { status: values.status, evaluationStatus: summary.status };
  }

  // ผู้บริหาร/ผู้ดูแลระบบ: ผลรวมและคะแนนรายข้อของทุกคน (ใช้พิมพ์รายงาน)
  function report(token, data) {
    AuthService.requirePermission(token, 'paAdmin.view');
    var evaluation = loadEvaluation(data && data.evaluationId);
    var criteria = criteriaFor(evaluation.template);
    var rows = scoresOf(evaluation.id);
    var byRole = {};
    rows.forEach(function (row) { byRole[row.role] = { scores: parse(row), comment: row.comment, status: row.status }; });
    return { evaluation: evaluation, template: template(evaluation.template), criteria: criteria, components: APP_CONFIG.PA_COMPONENTS,
      byRole: byRole, roles: ROLES.map(function (role) { return { key: role[0], name: role[1], personnelId: evaluation[role[2]] }; }),
      summary: summarize(evaluation, criteria, rows) };
  }

  // ผู้ดูแลระบบเปิดให้แก้คะแนนอีกครั้ง (เช่น กรรมการส่งผิด)
  function reopen(token, data) {
    var context = AuthService.requirePermission(token, 'paAdmin.edit');
    var evaluation = loadEvaluation(data && data.evaluationId);
    var target = scoresOf(evaluation.id).filter(function (row) { return row.role === String(data && data.role); })[0];
    if (!target) throw SheetRepository.serviceError('NOT_FOUND', 'ผู้ประเมินคนนี้ยังไม่ได้บันทึกคะแนน');
    SheetRepository.update('PaScores', target.id, { status: 'draft' }, target.version, context.user.id);
    AuditService.write('PA_REOPEN', 'PaEvaluations', evaluation.id, { role: target.role }, context.user.id);
    return refresh(evaluation, context.user.id);
  }

  function aiComment(token, data) {
    var context = AuthService.requirePermission(token, 'paSelf.view');
    var evaluation = loadEvaluation(data && data.evaluationId);
    if (!roleIn(evaluation, context.user.personnelId)) throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่ได้เป็นผู้ประเมินในรายการนี้');
    var criteria = criteriaFor(evaluation.template);
    var scores = (data && data.scores) || {};
    var rated = criteria.filter(function (item) { return [1, 2, 3, 4].indexOf(Number(scores[item.id])) !== -1; });
    if (!rated.length) throw SheetRepository.serviceError('VALIDATION_ERROR', 'กรุณาให้ระดับคะแนนก่อนให้ AI ช่วยร่าง');
    var lines = rated.map(function (item) { return item.item + ': ระดับ ' + scores[item.id] + '/4'; });
    var system = 'คุณคือผู้ช่วยกรรมการประเมินผลการปฏิบัติงานของข้าราชการครู (ว.23) ช่วยร่างความเห็นของกรรมการเป็นภาษาไทย สุภาพ เป็นทางการ ' +
      'ระบุจุดเด่นและข้อเสนอแนะเพื่อการพัฒนา อ้างอิงเฉพาะระดับคะแนนที่ให้มา ห้ามแต่งข้อเท็จจริง ความยาวไม่เกิน 6 ประโยค';
    return { text: AiService.run(context, 'pa', system, [{ role: 'user', text: 'แบบประเมิน: ' + evaluation.template + '\n' + lines.join('\n') }], { maxTokens: 700 }).text };
  }

  return { myTasks: myTasks, getForm: getForm, saveScore: saveScore, report: report, reopen: reopen, aiComment: aiComment,
    summarize: summarize, criteriaFor: criteriaFor, levelOf: levelOf, refresh: refresh };
})();
