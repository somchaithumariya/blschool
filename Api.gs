/**
 * จุดเดียวที่หน้าเว็บเรียกเข้ามา (google.script.run.api)
 * ทุกคำสั่งตรวจสิทธิ์ภายใน service ของตัวเอง
 */
function api(request) {
  var started = Date.now();
  try {
    var payload = request || {};
    var action = String(payload.action || '');
    var token = payload.token;
    var data = payload.data || {};
    // ข้อมูลผู้คิดค้นและพัฒนาระบบต้องครบถ้วน (Credit.gs)
    requireDeveloperCredit();
    // โรงเรียนที่เรียกมา (ว่าง = โรงเรียนหลัก) ต้องเลือกก่อนแตะข้อมูลใด ๆ
    Tenant.use(payload.tenant);
    var publicActions = ['public.settings', 'public.landing', 'public.today', 'demo.step', 'auth.login', 'auth.register', 'registry.assets', 'registry.submit',
      'concern.submit', 'concern.track', 'concern.followUp', 'swot.publicSubmit'];
    if (publicActions.indexOf(action) === -1) {
      var authContext = AuthService.requireSession(token);
      var forcedPasswordActions = ['auth.changePassword', 'auth.logout'];
      if (authContext.user.mustChangePassword === true && forcedPasswordActions.indexOf(action) === -1) {
        throw SheetRepository.serviceError('PASSWORD_CHANGE_REQUIRED', 'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งานระบบ');
      }
    }
    var handler = API_HANDLERS[action];
    if (!handler) throw SheetRepository.serviceError('UNKNOWN_ACTION', 'ไม่พบคำสั่งที่ร้องขอ');
    var result = handler(token, data);
    // ms = เวลาที่เซิร์ฟเวอร์ใช้จริง (หน้าเว็บนำไปแสดงในศูนย์ผู้ดูแลระบบ เพื่อแยกว่าช้าที่เซิร์ฟเวอร์หรือที่เครือข่าย)
    return { ok: true, data: result, error: null, ms: Date.now() - started };
  } catch (error) {
    console.error(JSON.stringify({ code: error.code || 'INTERNAL_ERROR', action: request && request.action, message: error.message }));
    return {
      ok: false,
      ms: Date.now() - started,
      data: null,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.code ? error.message : 'ระบบไม่สามารถดำเนินการได้ในขณะนี้',
        fieldErrors: error.fieldErrors || {}
      }
    };
  }
}

var API_HANDLERS = {
  // ระบบและการเข้าสู่ระบบ
  'public.settings': function () { return SettingsService.getPublicSettings(); },
  'public.landing': function () { return LandingService.get(); },
  'public.today': function () { return LandingService.today(); },
  'demo.step': function () { return DemoService.step(); },
  // ขอใช้ระบบ (โรงเรียนอื่น) และจัดการโรงเรียนที่ใช้ระบบ (เฉพาะผู้ดูแลของโรงเรียนหลัก)
  'leave.formData': function (token, data) { return LeaveService.formData(token, data); },
  'registry.assets': function () { return DistributionService.assets(); },
  'registry.submit': function (token, data) { return DistributionService.submit(data); },
  'distribution.list': function (token) { return DistributionService.list(token); },
  'distribution.saveConfig': function (token, data) { return DistributionService.saveConfig(token, data); },
  'distribution.install': function (token, data) { return DistributionService.installNow(token, data); },
  'distribution.setStatus': function (token, data) { return DistributionService.setStatus(token, data); },
  'distribution.resetPassword': function (token, data) { return DistributionService.resetPassword(token, data); },
  'demo.status': function (token) { AuthService.requirePermission(token, 'settings.edit'); return DemoService.status(); },
  'demo.load': function (token) { return DemoService.load(token); },
  'demo.run': function (token) { return DemoService.stepAuthed(token); },
  'demo.clear': function (token, data) { return DemoService.clear(token, data); },
  'auth.login': function (token, data) {
    var result = AuthService.login(data);
    // ส่งสถานะแอปกลับไปพร้อมกัน เพื่อลดการเรียกเซิร์ฟเวอร์หลังเข้าสู่ระบบ
    if (!result.user.mustChangePassword) result.state = SettingsService.getApplicationState(result.token);
    return result;
  },
  'auth.logout': function (token) { return AuthService.logout(token); },
  'auth.register': function (token, data) { return UserService.register(data); },
  'auth.changePassword': function (token, data) { return AuthService.changePassword(token, data); },
  'app.state': function (token) { return SettingsService.getApplicationState(token); },
  'system.warm': function (token) { return AdminService.warm(token); },
  'admin.health': function (token, data) { return AdminService.health(token, data); },
  'admin.checks': function (token) { return AdminService.checks(token); },
  'admin.compact': function (token) { return AdminService.compact(token); },
  'admin.clearCache': function (token) { return AdminService.clearCache(token); },
  'admin.bulkCheck': function (token) { return AdminService.bulkCheck(token); },
  'texts.save': function (token, data) { return SettingsService.saveTexts(token, data); },
  'lookups.get': function (token) { return EntityService.lookups(token); },
  'profile.get': function (token) { return UserService.profile(token); },

  // แดชบอร์ดและ SOS
  'dashboard.get': function (token) { return DashboardService.getDashboard(token); },
  'sos.send': function (token, data) { return SosService.send(token, data); },
  'sos.acknowledge': function (token, data) { return SosService.acknowledge(token, data); },

  // ตั้งค่าระบบ
  'settings.update': function (token, data) { return SettingsService.updateSettings(token, data); },
  'settings.uploadLogo': function (token, data) { return SettingsService.uploadLogo(token, data); },
  'settings.uploadImage': function (token, data) { return SettingsService.uploadImage(token, data); },
  'settings.storeImage': function (token, data) { return SettingsService.storeImage(token, data); },
  'settings.saveLanding': function (token, data) { return SettingsService.saveLanding(token, data); },
  'settings.removeImage': function (token, data) { return SettingsService.removeImage(token, data); },
  // AI กลาง
  'ai.settings': function (token) { return AiService.getSettings(token); },
  'ai.saveSettings': function (token, data) { return AiService.saveSettings(token, data); },
  'ai.test': function (token, data) { return AiService.test(token, data); },
  'ai.status': function (token) { return AiService.status(token); },
  'ai.assistant': function (token, data) { return AiService.assistant(token, data); },
  'bot.ask': function (token, data) { return BotService.ask(token, data); },
  'bot.knowledge': function (token) { return BotService.getKnowledge(token); },
  'bot.saveKnowledge': function (token, data) { return BotService.saveKnowledge(token, data); },
  // ดูแลช่วยเหลือนักเรียน
  'care.overview': function (token, data) { return CareService.overview(token, data); },
  'care.file': function (token, data) { return CareService.file(token, data); },
  'care.sdqItems': function (token) { return CareService.sdqItems(token); },
  'care.saveSdq': function (token, data) { return CareService.saveSdq(token, data); },
  'care.homeMap': function (token, data) { return CareService.homeMap(token, data); },
  'care.aiSummary': function (token, data) { return CareService.aiSummary(token, data); },
  'care.insights': function (token, data) { return CareInsightService.insights(token, data); },
  'care.analyzeOverview': function (token, data) { return CareInsightService.analyzeOverview(token, data); },
  // ห้องรับฟัง: 3 คำสั่งแรกเปิดให้นักเรียนใช้โดยไม่ต้องเข้าสู่ระบบ (จำกัดความถี่ใน ConcernService) ที่เหลือสำหรับทีมดูแล
  'concern.submit': function (token, data) { return ConcernService.submit(data); },
  'concern.track': function (token, data) { return ConcernService.track(data); },
  'concern.followUp': function (token, data) { return ConcernService.followUp(data); },
  'concern.inbox': function (token, data) { return ConcernService.inbox(token, data); },
  'concern.update': function (token, data) { return ConcernService.update(token, data); },
  'concern.reply': function (token, data) { return ConcernService.reply(token, data); },
  'concern.toCounseling': function (token, data) { return ConcernService.toCounseling(token, data); },
  'concern.config': function (token) { return ConcernService.getConfig(token); },
  'concern.saveConfig': function (token, data) { return ConcernService.saveConfig(token, data); },
  // ความปลอดภัย
  'safety.dashboard': function (token, data) { return SafetyService.dashboard(token, data); },
  'safety.analyzeIncident': function (token, data) { return SafetyService.analyzeIncident(token, data); },
  'dashboard.map': function (token, data) { return SafetyService.mapLayers(token, data); },
  'safety.analyzeDashboard': function (token, data) { return SafetyService.analyzeDashboard(token, data); },
  'safety.suggestPlan': function (token, data) { return SafetyService.suggestPlan(token, data); },
  // นิเทศ
  'supervision.getScoring': function (token, data) { return SupervisionService.getScoring(token, data); },
  'supervision.page': function (token, data) { return SupervisionService.page(token, data); },
  'supervision.request': function (token, data) { return SupervisionService.request(token, data); },
  'supervision.updateRequest': function (token, data) { return SupervisionService.updateRequest(token, data); },
  'supervision.cancelRequest': function (token, data) { return SupervisionService.cancelRequest(token, data); },
  'supervision.assign': function (token, data) { return SupervisionService.assign(token, data); },
  'supervision.saveMyScore': function (token, data) { return SupervisionService.saveMyScore(token, data); },
  'supervision.summarize': function (token, data) { return SupervisionService.summarize(token, data); },
  'supervision.reopen': function (token, data) { return SupervisionService.reopen(token, data); },
  'supervision.aiAdvice': function (token, data) { return SupervisionService.aiAdvice(token, data); },
  'supervision.overview': function (token, data) { return SupervisionService.overview(token, data); },
  'supervision.aiOverview': function (token, data) { return SupervisionService.aiOverview(token, data); },
  'plc.polish': function (token, data) { return SupervisionService.plcPolish(token, data); },
  'review.submit': function (token, data) { return ReviewService.submit(token, data); },
  'review.statusOf': function (token, data) { return ReviewService.statusOf(token, data); },
  'review.list': function (token, data) { return ReviewService.list(token, data); },
  'review.get': function (token, data) { return ReviewService.get(token, data); },
  'review.decide': function (token, data) { return ReviewService.decide(token, data); },
  'review.preview': function (token, data) { return ReviewService.preview(token, data); },
  'review.reopen': function (token, data) { return ReviewService.reopen(token, data); },
  'supervision.aiDraft': function (token, data) { return SupervisionService.aiDraft(token, data); },
  // ประเมิน ว.23
  'pa.myTasks': function (token) { return PaService.myTasks(token); },
  'pa.getForm': function (token, data) { return PaService.getForm(token, data); },
  'pa.saveScore': function (token, data) { return PaService.saveScore(token, data); },
  'pa.report': function (token, data) { return PaService.report(token, data); },
  'pa.reopen': function (token, data) { return PaService.reopen(token, data); },
  'pa.aiComment': function (token, data) { return PaService.aiComment(token, data); },
  // SWOT
  'swot.data': function (token, data) { return SwotService.data(token, data); },
  'swot.saveResponse': function (token, data) { return SwotService.saveResponse(token, data); },
  'swot.aiSummary': function (token, data) { return SwotService.aiSummary(token, data); },
  'swot.result': function (token, data) { return SwotService.data(token, data); },
  'swot.saveSurvey': function (token, data) { return SwotService.saveSurvey(token, data); },
  'swot.aiQuestions': function (token, data) { return SwotService.aiQuestions(token, data); },
  'swot.saveQuestions': function (token, data) { return SwotService.saveQuestions(token, data); },
  'swot.aiIssues': function (token, data) { return SwotService.aiIssues(token, data); },
  'swot.addIssues': function (token, data) { return SwotService.addIssues(token, data); },
  'swot.seedNeeds': function (token, data) { return SwotService.seedNeeds(token, data); },
  'swot.publicSubmit': function (token, data) { return SwotService.publicSubmit(data); },
  'strategy.page': function (token, data) { return StrategyService.page(token, data); },
  'strategy.saveItems': function (token, data) { return StrategyService.saveItems(token, data); },
  'strategy.confirm': function (token, data) { return StrategyService.confirm(token, data); },
  'strategy.aiDraft': function (token, data) { return StrategyService.aiDraft(token, data); },
  'strategy.createProjects': function (token, data) { return StrategyService.createProjects(token, data); },
  'strategy.publish': function (token, data) { return StrategyService.publish(token, data); },
  'project.polish': function (token, data) { return StrategyService.polishReport(token, data); },
  // ลงเวลามาทำงาน
  'checkin.today': function (token) { return CheckinService.today(token); },
  'checkin.in': function (token, data) { return CheckinService.checkIn(token, data); },
  'checkin.out': function (token, data) { return CheckinService.checkOut(token, data); },
  'checkin.config': function (token) { return CheckinService.getConfig(token); },
  'checkin.saveConfig': function (token, data) { return CheckinService.saveConfig(token, data); },
  'checkin.report': function (token, data) { return CheckinService.report(token, data); },
  'checkin.manual': function (token, data) { return CheckinService.manual(token, data); },
  'checkin.remove': function (token, data) { return CheckinService.removeRecord(token, data); },
  // เวลาเรียนนักเรียน
  'attendance.riskList': function (token, data) { return AttendanceService.riskList(token, data); },
  'attendance.studentHistory': function (token, data) { return AttendanceService.studentHistory(token, data); },
  'yearClose.preview': function (token, data) { return YearCloseService.preview(token, data); },
  'yearClose.run': function (token, data) { return YearCloseService.run(token, data); },
  'yearClose.history': function (token) { return YearCloseService.history(token); },
  'yearClose.copyTerm': function (token, data) { return YearCloseService.copyTerm(token, data); },
  'yearClose.export': function (token, data) { return YearCloseService.exportYear(token, data); },
  'yearClose.undoIncomplete': function (token, data) { return YearCloseService.undoIncomplete(token, data); },
  'integrations.list': function (token) { return IntegrationService.list(token); },
  'integrations.save': function (token, data) { return IntegrationService.save(token, data); },
  'integrations.delete': function (token, data) { return IntegrationService.remove(token, data); },
  'modules.update': function (token, data) { return SettingsService.updateModules(token, Array.isArray(data) ? data : []); },
  'master.list': function (token, data) { return MasterDataService.list(token, data); },
  'master.save': function (token, data) { return MasterDataService.save(token, data); },
  'master.delete': function (token, data) { return MasterDataService.remove(token, data); },

  // โมดูลแบบตาราง/ฟอร์ม
  'entity.list': function (token, data) { return EntityService.list(token, data); },
  'entity.save': function (token, data) { return EntityService.save(token, data); },
  'entity.delete': function (token, data) { return EntityService.remove(token, data); },
  'entity.import': function (token, data) { return EntityService.importRows(token, data); },
  'file.upload': function (token, data) { return EntityService.uploadFile(token, data); },
  'file.get': function (token, data) { return EntityService.getFile(token, data); },

  // การมาเรียน
  'attendance.get': function (token, data) { return AttendanceService.getSheet(token, data); },
  'attendance.save': function (token, data) { return AttendanceService.saveSheet(token, data); },
  'attendance.report': function (token, data) { return AttendanceService.studentReport(token, data); },
  'attendance.lateAbsence': function (token, data) { return AttendanceService.lateAbsence(token, data); },
  'attendance.register': function (token, data) { return AttendanceService.register(token, data); },
  'attendance.export': function (token, data) { return AttendanceService.exportRows(token, data); },

  'roster.get': function (token, data) {
    var context = AuthService.requireSession(token);
    if (!['homeroom.view', 'attendance.view', 'porpor6.view'].some(function (key) { return Core.hasPermission(context.permissions, key); })) {
      throw SheetRepository.serviceError('FORBIDDEN', 'คุณไม่มีสิทธิ์ดูรายชื่อนักเรียน');
    }
    var homeroom = SheetRepository.findById('Homerooms', data.homeroomId);
    if (!homeroom) throw SheetRepository.serviceError('NOT_FOUND', 'ไม่พบห้องเรียน');
    return AttendanceService.roster(homeroom.academicYearId, homeroom.id);
  },

  // ผลการเรียน
  'teaching.analyze': function (token, data) { return TeachingLogService.analyze(token, data); },
  'homeroomLog.day': function (token, data) { return HomeroomLogService.day(token, data); },
  'grades.get': function (token, data) { return GradeService.getSheet(token, data); },
  'grades.save': function (token, data) { return GradeService.saveSheet(token, data); },
  'grades.courseReport': function (token, data) { return GradeService.courseReport(token, data); },
  'grades.studentReport': function (token, data) { return GradeService.studentReport(token, data); },

  // รายงาน
  'report.information': function (token, data) { return ReportService.information(token, data); },
  'report.awards': function (token, data) { return ReportService.awards(token, data); },
  'report.schoolBasic': function (token, data) { return ReportService.schoolBasic(token, data); },
  'report.teacherBasic': function (token) { return ReportService.teacherBasic(token); },
  'report.sar': function (token, data) { return ReportService.sar(token, data); },
  'report.audit': function (token, data) { return ReportService.auditLogs(token, data); },

  // ผู้ใช้และสิทธิ์
  'users.list': function (token) { return UserService.listUsers(token); },
  'users.candidates': function (token) { return UserService.accountCandidates(token); },
  'users.bulkCreate': function (token, data) { return UserService.bulkCreate(token, data); },
  'users.save': function (token, data) { return UserService.saveUser(token, data); },
  'users.resetPassword': function (token, data) { return UserService.resetPassword(token, data); },
  'users.delete': function (token, data) { return UserService.deleteUser(token, data); },
  'users.approve': function (token, data) { return UserService.approve(token, data); },
  'users.reject': function (token, data) { return UserService.reject(token, data); },
  'notify.get': function (token) { return NotifyService.getConfig(token); },
  'notify.save': function (token, data) { return NotifyService.saveConfig(token, data); },
  'notify.test': function (token) { return NotifyService.test(token); },
  'roles.list': function (token) { return UserService.listRoles(token); },
  'roles.save': function (token, data) { return UserService.saveRole(token, data); }
};
