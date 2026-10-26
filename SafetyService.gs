// ความปลอดภัยในสถานศึกษา: ภาพรวม (เหตุการณ์ จุดเสี่ยง แผน SPS ส่งต่อ SOS), แผนที่ และ AI วิเคราะห์/แนะนำกิจกรรม SPS
var SafetyService = (function () {
  'use strict';

  var CLOSED_INCIDENT = ['แก้ไขแล้ว', 'ปิดเรื่อง'];

  function activeYearId() {
    var year = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    return year ? String(year.id) : '';
  }
  function today() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }
  function countBy(rows, key, order) {
    var result = {};
    (order || []).forEach(function (name) { result[name] = 0; });
    rows.forEach(function (row) { var value = row[key] || 'ไม่ระบุ'; result[value] = (result[value] || 0) + 1; });
    return result;
  }

  function stats(yearId) {
    var inYear = function (sheet) { return SheetRepository.all(sheet).filter(function (row) { return String(row.academicYearId) === yearId; }); };
    var incidents = inYear('SafetyIncidents');
    var risks = inYear('SafetyRisks');
    var plan = inYear('SpsActivities');
    var referrals = inYear('Referrals');
    var now = today();
    var byMonth = {};
    incidents.forEach(function (row) { var month = String(row.incidentDate || '').slice(0, 7); if (month) byMonth[month] = (byMonth[month] || 0) + 1; });
    var types = countBy(incidents, 'hazardType');
    return {
      incidents: { total: incidents.length, open: incidents.filter(function (row) { return CLOSED_INCIDENT.indexOf(row.status) === -1; }).length,
        byCategory: countBy(incidents, 'category', APP_CONFIG.HAZARD_GROUPS), byStatus: countBy(incidents, 'status'), bySeverity: countBy(incidents, 'severity'),
        byMonth: byMonth, topTypes: Object.keys(types).map(function (name) { return { name: name, count: types[name] }; })
          .sort(function (a, b) { return b.count - a.count; }).slice(0, 8) },
      risks: { total: risks.length, fixed: risks.filter(function (row) { return row.status === 'แก้ไขแล้ว'; }).length,
        overdue: risks.filter(function (row) { return row.status !== 'แก้ไขแล้ว' && row.dueDate && row.dueDate < now; }).length,
        byLevel: countBy(risks, 'riskLevel', ['ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก']), byStatus: countBy(risks, 'status') },
      plan: { total: plan.length, byStatus: countBy(plan, 'status', ['ยังไม่เริ่ม', 'กำลังดำเนินการ', 'เสร็จสิ้น']), byCategory: countBy(plan, 'category', APP_CONFIG.HAZARD_GROUPS) },
      referrals: { external: referrals.filter(function (row) { return /ภายนอก/.test(row.referType); }).length, internal: referrals.filter(function (row) { return /ภายใน/.test(row.referType); }).length },
      sos: { open: SheetRepository.all('SosAlerts').filter(function (row) { return row.status === 'open'; }).length }
    };
  }

  function dashboard(token, data) {
    AuthService.requirePermission(token, 'safety.view');
    var yearId = String((data && data.academicYearId) || activeYearId());
    var result = SheetRepository.memoResult('safety:' + yearId, function () { return dashboardData(yearId); }, { stamp: today(),
      persist: 'safety:' + yearId, deps: ['SafetyIncidents', 'SafetyRisks', 'SpsActivities', 'Referrals', 'SosAlerts'] });
    result.school = CheckinService.schoolLocation();
    result.academicYearId = yearId;
    return result;
  }

  function dashboardData(yearId) {
    var result = stats(yearId);
    var inYear = function (sheet) { return SheetRepository.all(sheet).filter(function (row) { return String(row.academicYearId) === yearId; }); };
    result.recent = inYear('SafetyIncidents').filter(function (row) { return CLOSED_INCIDENT.indexOf(row.status) === -1; })
      .sort(function (a, b) { return String(b.incidentDate).localeCompare(String(a.incidentDate)); }).slice(0, 10)
      .map(function (row) { return { id: row.id, incidentDate: row.incidentDate, category: row.category, hazardType: row.hazardType, severity: row.severity,
        location: row.location, status: row.status }; });
    result.points = inYear('SafetyIncidents').concat(inYear('SafetyRisks')).filter(function (row) { return row.latitude && row.longitude; })
      .map(function (row) {
        var isRisk = row.riskLevel !== undefined;
        return { kind: isRisk ? 'risk' : 'incident', lat: Number(row.latitude), lng: Number(row.longitude), location: row.location,
          label: isRisk ? 'จุดเสี่ยง: ' + (row.riskLevel || '') : (row.hazardType || row.category || 'เหตุการณ์'), status: row.status,
          date: isRisk ? row.foundDate : row.incidentDate };
      }).filter(function (point) { return isFinite(point.lat) && isFinite(point.lng); });
    return result;
  }

  // ---------- แผนที่บนแดชบอร์ด: บ้านนักเรียน (จากเยี่ยมบ้าน) จุดเสี่ยง และเหตุการณ์ แยกเป็นชั้นเปิด/ปิดได้ ----------
  // บ้านนักเรียน: ผู้บริหาร/ผู้ดูแลระบบเห็นทั้งโรงเรียน ครูเห็นเฉพาะห้องที่ตนเป็นครูที่ปรึกษา/ที่ปรึกษาร่วม
  function mapLayers(token, data) {
    var context = AuthService.requireSession(token);
    var yearId = String((data && data.academicYearId) || activeYearId());
    var can = function (key) { return Core.hasPermission(context.permissions, key); };
    var inYear = function (sheet) { return SheetRepository.all(sheet).filter(function (row) { return String(row.academicYearId) === yearId && row.latitude && row.longitude; }); };
    var point = function (row) { var lat = Number(row.latitude), lng = Number(row.longitude); return isFinite(lat) && isFinite(lng) ? { lat: lat, lng: lng } : null; };
    var result = { academicYearId: yearId, school: CheckinService.schoolLocation(), incidents: null, risks: null, homes: null, homesScope: '' };
    if (can('safety.view')) {
      result.incidents = inYear('SafetyIncidents').map(function (row) {
        var at = point(row);
        return at && Object.assign(at, { id: row.id, date: row.incidentDate, title: row.hazardType || row.category || 'เหตุการณ์', category: row.category,
          severity: row.severity, location: row.location, status: row.status, open: CLOSED_INCIDENT.indexOf(row.status) === -1 });
      }).filter(Boolean);
      result.risks = inYear('SafetyRisks').map(function (row) {
        var at = point(row);
        return at && Object.assign(at, { id: row.id, date: row.foundDate, title: String(row.detail || '').slice(0, 80), level: row.riskLevel,
          location: row.location, status: row.status, open: row.status !== 'แก้ไขแล้ว' });
      }).filter(Boolean);
    }
    if (can('homeVisit.view')) {
      var everyone = (context.roles || []).some(function (role) { return role === 'admin' || role === 'executive'; });
      var own = String(context.user.personnelId || '');
      var rooms = SheetRepository.all('Homerooms').filter(function (room) {
        return String(room.academicYearId) === yearId && (everyone || (own && (String(room.advisorId) === own || String(room.coAdvisorId) === own)));
      });
      var roomIds = EntityService.indexBy(rooms);
      var roomOf = {};
      SheetRepository.all('StudentEnrollments').forEach(function (row) {
        if (String(row.academicYearId) === yearId && roomIds[row.homeroomId]) roomOf[row.studentId] = roomIds[row.homeroomId];
      });
      var students = EntityService.indexBy(SheetRepository.all('Students'));
      var titles = EntityService.indexBy(SheetRepository.all('Titles'));
      var latest = {};
      inYear('HomeVisits').forEach(function (row) {
        if (roomOf[row.studentId] && (!latest[row.studentId] || String(row.visitDate) > String(latest[row.studentId].visitDate))) latest[row.studentId] = row;
      });
      result.homesScope = everyone ? 'ทั้งโรงเรียน' : rooms.length ? 'ห้องที่ปรึกษาของคุณ' : '';
      result.homes = Object.keys(latest).map(function (studentId) {
        var visit = latest[studentId];
        var at = point(visit);
        var student = students[studentId] || {};
        var room = roomOf[studentId];
        return at && Object.assign(at, { studentId: studentId, name: ((titles[student.titleId] ? titles[student.titleId].name : '') + (student.firstName || '') + ' ' + (student.lastName || '')).trim(),
          room: room.gradeLevel + '/' + room.roomName, economicStatus: visit.economicStatus || '', visitDate: visit.visitDate, distanceKm: visit.distanceKm });
      }).filter(Boolean);
    }
    return result;
  }

  var EXPERT ='คุณคือผู้เชี่ยวชาญด้านความปลอดภัยในสถานศึกษาของไทย คุ้นเคยกับโครงการโรงเรียนส่งเสริมความปลอดภัย (SPS) ของ สพฐ. ' +
    'ตอบเป็นภาษาไทย จัดหัวข้อชัดเจน กระชับ นำไปปฏิบัติได้จริง ใช้เฉพาะข้อมูลที่ให้มา ห้ามแต่งข้อเท็จจริงเพิ่ม';

  function analyzeIncident(token, data) {
    var context = AuthService.requirePermission(token, 'safety.view');
    var row = SheetRepository.findById('SafetyIncidents', data && data.id);
    if (!row) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบเหตุการณ์');
    // ไม่ส่งชื่อผู้เกี่ยวข้องและผู้รับผิดชอบ
    var detail = { วันที่: row.incidentDate, เวลา: row.incidentTime, กลุ่มภัย: row.category, ประเภทภัย: row.hazardType, ความรุนแรง: row.severity,
      สถานที่: row.location, รายละเอียด: row.description, การดำเนินการเบื้องต้น: row.initialAction, สถานะ: row.status, ผลการแก้ไข: row.resolution };
    var prompt = 'ข้อมูลเหตุการณ์ความไม่ปลอดภัยในโรงเรียน:\n' + JSON.stringify(detail) +
      '\n\nช่วยวิเคราะห์ตามหัวข้อ: 1. สรุปเหตุการณ์ 2. ระดับความรุนแรงและผลกระทบต่อผู้เรียน 3. มาตรการแก้ไขเร่งด่วน 4. มาตรการป้องกันระยะยาว 5. ประเด็นสำหรับถอดบทเรียน (AAR)';
    return { analysis: AiService.run(context, 'safety', EXPERT, [{ role: 'user', text: prompt }], { maxTokens: 1500 }).text };
  }

  function analyzeDashboard(token, data) {
    var context = AuthService.requirePermission(token, 'safety.view');
    var yearId = String((data && data.academicYearId) || activeYearId());
    var summary = stats(yearId);
    var prompt = 'สถิติความปลอดภัยของโรงเรียนในปีการศึกษานี้ (JSON):\n' + JSON.stringify(summary) +
      '\n\nช่วยวิเคราะห์: 1. สถานะความปลอดภัยในภาพรวม 2. ประเด็นที่น่ากังวลที่สุด 3. ข้อเสนอแนะเชิงบริหาร 3 ข้อสำหรับผู้อำนวยการ';
    return { analysis: AiService.run(context, 'safety', EXPERT, [{ role: 'user', text: prompt }], { maxTokens: 1500 }).text };
  }

  // แนะนำกิจกรรม SPS: ใช้สถิติจริงเป็นฐาน (ทำงานได้แม้ไม่มี AI) และให้ AI เรียบเรียงถ้าเปิดใช้งาน
  function suggestPlan(token, data) {
    var context = AuthService.requirePermission(token, 'safety.view');
    var yearId = String((data && data.academicYearId) || activeYearId());
    var summary = stats(yearId);
    var groupOfType = {};
    SheetRepository.all('SafetyIncidents').forEach(function (row) { if (String(row.academicYearId) === yearId && row.hazardType) groupOfType[row.hazardType] = row.category; });
    var base = summary.incidents.topTypes.slice(0, 5).map(function (item) {
      return { category: groupOfType[item.name] || APP_CONFIG.HAZARD_GROUPS[0], activity: 'กิจกรรมป้องกันและเฝ้าระวัง' + item.name,
        reason: 'พบเหตุการณ์ประเภทนี้ ' + item.count + ' ครั้งในปีการศึกษานี้' };
    });
    var ai = AiService.status(token).safety;
    if (!ai || !base.length) return { suggestions: base, aiUsed: false };
    var prompt = 'สถิติเหตุการณ์ของโรงเรียน (JSON): ' + JSON.stringify(summary.incidents) + '\nจุดเสี่ยง (JSON): ' + JSON.stringify(summary.risks) +
      '\n\nเสนอกิจกรรมความปลอดภัย 4–6 กิจกรรมสำหรับแผนปีการศึกษาถัดไป ตอบเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น รูปแบบ ' +
      '[{"category":"กลุ่มภัย","activity":"ชื่อกิจกรรม","reason":"เหตุผลอ้างอิงสถิติ"}] โดย category ต้องเป็นหนึ่งใน: ' + APP_CONFIG.HAZARD_GROUPS.join(' | ');
    var text = AiService.run(context, 'safety', EXPERT, [{ role: 'user', text: prompt }], { maxTokens: 1500, temperature: 0.3 }).text;
    var parsed = [];
    try {
      var match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    } catch (error) { parsed = []; }
    var suggestions = (Array.isArray(parsed) ? parsed : []).filter(function (item) { return item && item.activity; }).slice(0, 6).map(function (item) {
      return { category: APP_CONFIG.HAZARD_GROUPS.indexOf(String(item.category)) !== -1 ? String(item.category) : APP_CONFIG.HAZARD_GROUPS[0],
        activity: String(item.activity).slice(0, 300), reason: String(item.reason || '').slice(0, 500) };
    });
    return suggestions.length ? { suggestions: suggestions, aiUsed: true } : { suggestions: base, aiUsed: false };
  }

  return { dashboard: dashboard, analyzeIncident: analyzeIncident, analyzeDashboard: analyzeDashboard, suggestPlan: suggestPlan, stats: stats,
    mapLayers: mapLayers };
})();
