// ข้อมูลตัวอย่างทั้งระบบ (สมมติทั้งหมด ไม่ใช่ข้อมูลจริง) ใช้ทดสอบ/สาธิตทุกเมนู
// ทุกแถวที่สร้างมี createdBy = 'demo' จึงล้างออกได้ทั้งหมดโดยไม่กระทบข้อมูลจริง
// สร้างเป็นขั้น ๆ (แต่ละครั้งไม่เกิน ~4 นาที) และจำความคืบหน้าไว้ใน Script Property DEMO_STATE
var DemoService = (function () {
  'use strict';

  var ACTOR = 'demo';
  var STAGES = ['images', 'master', 'people', 'rooms', 'timetable', 'attendance', 'grades', 'records', 'documents', 'landing', 'extras'];
  var STAGE_LABELS = ['เตรียมรูปภาพ', 'ปีการศึกษา', 'บุคลากร', 'ห้องเรียนและนักเรียน', 'ตารางสอนและรายวิชา', 'เช็กชื่อ', 'คะแนน ปพ.5',
    'งานบันทึกและติดตาม', 'เอกสาร แผนการสอน SAR', 'หน้าแรกและรูปภาพ', 'ดูแลนักเรียน ความปลอดภัย นิเทศ ว.23 SWOT ลงเวลา'];
  var TIME_BUDGET_MS = 230000;
  var IMAGE_CHUNK = 22;
  // ตารางที่ล้างตอนลบข้อมูลตัวอย่าง
  var DEMO_SHEETS = ['Personnel', 'PersonnelYears', 'TeachingLoads', 'Supervisions', 'Students', 'StudentEnrollments', 'Homerooms',
    'StudentInformation', 'HomeVisits', 'SupportCases', 'SdqAssessments', 'Scholarships', 'TimetableEntries', 'LessonPlans', 'Courses',
    'GradeSheets', 'AttendanceSessions', 'Awards', 'SarSections', 'QaIndicators', 'Portfolios', 'Policies', 'Documents',
    'ApprovalPositions', 'Signatures', 'Announcements', 'CalendarEvents', 'Files', 'SosAlerts', 'StudentFamilies', 'Screenings', 'Counselings', 'Referrals',
    'AarRecords', 'SafetyIncidents', 'SafetyRisks', 'SpsActivities', 'PlcRecords', 'PaEvaluations', 'PaScores', 'SwotIssues', 'SwotResponses', 'StaffCheckins',
    'TeachingLogs', 'HomeroomLogs', 'StudentConcerns', 'SupervisionScores', 'NeedsItems', 'StrategyPlans', 'StrategyItems', 'Projects',
    'ProjectReports'];

  var MALE = ['สมชาย', 'สมศักดิ์', 'วิชัย', 'ประเสริฐ', 'สุรชัย', 'อนุชา', 'ธนากร', 'กิตติพงษ์', 'ณัฐวุฒิ', 'ปิยะ', 'เอกชัย', 'วีระ', 'สุทัศน์',
    'พงศกร', 'ชัยวัฒน์', 'ธีรพงษ์', 'อดิศร', 'นพดล', 'ภาณุวัฒน์', 'รัฐพล', 'ศุภชัย', 'สรวิชญ์', 'กฤษณะ', 'ภูมิพัฒน์', 'ธนดล', 'พีรพัฒน์',
    'ชนาธิป', 'นันทวัฒน์', 'เตชิต', 'คณิศร', 'ปวริศ', 'รชต', 'วรเมธ', 'ภัทรดนัย', 'ธนภัทร', 'จิรายุ', 'ศิวกร', 'กันตพัฒน์', 'อภิวัฒน์', 'ก้องภพ'];
  var FEMALE = ['สมหญิง', 'สุนีย์', 'วันเพ็ญ', 'นภาพร', 'จิราพร', 'พิมพ์ใจ', 'กัญญารัตน์', 'ศิริพร', 'ชลธิชา', 'ปวีณา', 'อรทัย', 'รัตนา', 'สุดารัตน์',
    'ธัญญาลักษณ์', 'พรทิพย์', 'ณัฐธิดา', 'ปาริชาต', 'วรัญญา', 'กมลชนก', 'ภัทราภรณ์', 'สิริกัญญา', 'นันทนา', 'เพชรลดา', 'ชญานิศ', 'อภิชญา',
    'พิมพ์ชนก', 'ญาณิศา', 'ธนพร', 'ศศิกานต์', 'มัลลิกา', 'เบญจมาศ', 'ขวัญข้าว', 'ฟ้าใส', 'น้ำผึ้ง', 'ใบบัว', 'ณิชกานต์', 'สุพิชญา', 'พัชราภา', 'อารียา', 'ปณิดา'];
  var SURNAMES = ['ใจดี', 'รักเรียน', 'สุขสวัสดิ์', 'วงศ์สว่าง', 'เจริญผล', 'แก้วกาญจน์', 'ศรีสุข', 'พูนสวัสดิ์', 'ทองดี', 'บุญมี', 'สมบูรณ์', 'ชัยชนะ',
    'มั่นคง', 'รุ่งเรือง', 'ยิ้มแย้ม', 'คำแก้ว', 'สายบัว', 'ดวงดี', 'อินทร์แก้ว', 'ธรรมรักษ์', 'พรหมมา', 'ขันทอง', 'เพชรรัตน์', 'สุวรรณ', 'มณีวงษ์',
    'ศักดิ์สิทธิ์', 'วัฒนา', 'พิทักษ์', 'จันทร์เพ็ญ', 'ปัญญาดี', 'เกษมสุข', 'นาคทอง', 'แสงทอง', 'ภูมิใจ', 'สิงห์คำ', 'ใหญ่ยิ่ง', 'กล้าหาญ',
    'ตันติวงศ์', 'ศรีสมบัติ', 'ลาภเจริญ'];
  var SUBJECTS = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
    'ภาษาอังกฤษ'];
  var GROUP_NAMES = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
    'ภาษาต่างประเทศ'];
  var SUBJECT_PREFIX = ['ท', 'ค', 'ว', 'ส', 'พ', 'ศ', 'ง', 'อ'];
  var GRADES = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  var ROOMS_PER_GRADE = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  var WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
  var UNITS = ['หน่วยที่ 1 เรื่องพื้นฐานที่ควรรู้', 'หน่วยที่ 2 การสำรวจและสังเกต', 'หน่วยที่ 3 การปฏิบัติและฝึกทักษะ', 'หน่วยที่ 4 การประยุกต์ใช้ในชีวิตจริง'];

  function props() { return Tenant.props(); }

  // รูปภาพจำลอง (ภาพวาด) เก็บเป็น JSON ในไฟล์ DemoAssetsPeople.html / DemoAssetsScenes.html
  // ไฟล์ .html โหลดเฉพาะเมื่อเรียกใช้ ต่างจาก .gs ที่ Apps Script โหลดทุกครั้งที่มีคำขอ
  var assetMemo = {};
  function assets(name) {
    if (!assetMemo[name]) assetMemo[name] = JSON.parse(HtmlService.createTemplateFromFile(name).getRawContent());
    return assetMemo[name];
  }
  function demoPeopleImages_() { return assets('DemoAssetsPeople'); }
  function demoSceneImages_() { return assets('DemoAssetsScenes'); }

  function readState() {
    try { return JSON.parse(props().getProperty('DEMO_STATE') || '{}'); } catch (error) { return {}; }
  }
  function writeState(state) { props().setProperty('DEMO_STATE', JSON.stringify(state)); }

  function random(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }
  function between(rand, low, high) { return low + Math.floor(rand() * (high - low + 1)); }
  function pad(number, size) { var text = String(number); while (text.length < size) text = '0' + text; return text; }
  function iso(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2); }
  function addDays(date, days) { var copy = new Date(date.getTime()); copy.setDate(copy.getDate() + days); return copy; }
  function today() { var now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  function insert(sheet, list) { return SheetRepository.insertMany(sheet, list, ACTOR); }
  function mine(sheet) { return SheetRepository.all(sheet).filter(function (row) { return row.createdBy === ACTOR; }); }
  // แผนกลยุทธ์ตัวอย่าง: TOWS → วิสัยทัศน์ → พันธกิจ → เป้าประสงค์ → กลยุทธ์ (ยืนยันครบ) + โครงการ 8 โครงการ + รายงานผล 3 โครงการ
  function seedStrategy(yearId, teachers, leaders, rand) {
    var order = 0;
    var item = function (level, code, text, parents, extra) {
      order += 1;
      return Object.assign({ academicYearId: yearId, level: level, code: code, text: text, parentIds: (parents || []).join(','), sourceCodes: '', standards: '',
        kpi: '', target: '', sortOrder: order, note: '' }, extra || {});
    };
    var tows = insert('StrategyItems', [
      item('tows', 'SO1', 'ใช้ความร่วมมือของชุมชนและแหล่งเรียนรู้ในท้องถิ่นยกระดับการเรียนรู้แบบลงมือปฏิบัติ', [], { sourceCodes: 'S1,O1' }),
      item('tows', 'SO2', 'ขยายการใช้ระบบสารสนเทศและอินเทอร์เน็ตที่ครอบคลุมพัฒนาการเรียนรู้ด้วยเทคโนโลยี', [], { sourceCodes: 'S6,O2' }),
      item('tows', 'WO1', 'ใช้นโยบายรัฐและงบสนับสนุนพัฒนาทักษะการอ่าน การเขียน และการคิดวิเคราะห์ของผู้เรียน', [], { sourceCodes: 'W2,O4,N1,N2' }),
      item('tows', 'WO2', 'พัฒนาครูด้านการวัดและประเมินผลโดยใช้เครือข่ายความร่วมมือภายนอก', [], { sourceCodes: 'W3,O1,N18' }),
      item('tows', 'ST1', 'ใช้ครูที่มีความรู้ตรงสาขาดูแลนักเรียนกลุ่มเสี่ยงด้านเกมและสื่อออนไลน์', [], { sourceCodes: 'S3,T2' }),
      item('tows', 'WT1', 'ระดมทรัพยากรจากภาคีเครือข่ายเพื่อซ่อมแซมอาคารและลดภาระค่าใช้จ่ายของผู้ปกครอง', [], { sourceCodes: 'W5,T3' })
    ]);
    var vision = insert('StrategyItems', [item('vision', 'วิสัยทัศน์', 'ภายในปี 2570 ผู้เรียนอ่านคล่อง คิดเป็น ใช้เทคโนโลยีอย่างสร้างสรรค์ มีคุณธรรม โดยการมีส่วนร่วมของชุมชน')])[0];
    var missions = insert('StrategyItems', [
      item('mission', 'พันธกิจที่ 1', 'พัฒนาผู้เรียนให้มีทักษะการอ่าน การเขียน การคิดวิเคราะห์ และผลสัมฤทธิ์ตามหลักสูตร', [vision.id], { standards: 'มาตรฐานที่ 1 คุณภาพของผู้เรียน' }),
      item('mission', 'พันธกิจที่ 2', 'พัฒนาครูให้จัดการเรียนรู้เชิงรุกและวัดประเมินผลอย่างเป็นระบบ', [vision.id], { standards: 'มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ' }),
      item('mission', 'พันธกิจที่ 3', 'บริหารจัดการด้วยระบบคุณภาพ เทคโนโลยี และการมีส่วนร่วมของชุมชน', [vision.id], { standards: 'มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ' })
    ]);
    var goals = insert('StrategyItems', [
      item('goal', 'เป้าประสงค์ที่ 1', 'ผู้เรียนอ่านออกเขียนได้และคิดวิเคราะห์ได้ตามระดับชั้น', [missions[0].id], { kpi: 'ร้อยละของนักเรียนที่ผ่านการประเมินการอ่านการเขียน', target: 'ร้อยละ 85' }),
      item('goal', 'เป้าประสงค์ที่ 2', 'ครูจัดการเรียนรู้เชิงรุกและใช้ผลการประเมินพัฒนาผู้เรียน', [missions[1].id], { kpi: 'ร้อยละของครูที่ผ่านการนิเทศระดับดีขึ้นไป', target: 'ร้อยละ 90' }),
      item('goal', 'เป้าประสงค์ที่ 3', 'โรงเรียนมีระบบสารสนเทศและเครือข่ายที่สนับสนุนการเรียนรู้', [missions[2].id], { kpi: 'ระดับความพึงพอใจของผู้มีส่วนเกี่ยวข้อง', target: 'ไม่น้อยกว่า 4.00' })
    ]);
    var strategies = insert('StrategyItems', [
      item('strategy', 'กลยุทธ์ที่ 1', 'ยกระดับการอ่าน การเขียน และการคิดวิเคราะห์ด้วยกิจกรรมลงมือปฏิบัติ', [goals[0].id], { sourceCodes: 'WO1,SO1', standards: 'มาตรฐานที่ 1 คุณภาพของผู้เรียน' }),
      item('strategy', 'กลยุทธ์ที่ 2', 'พัฒนาครูสู่การจัดการเรียนรู้เชิงรุกและการประเมินเพื่อพัฒนา', [goals[1].id], { sourceCodes: 'WO2', standards: 'มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ' }),
      item('strategy', 'กลยุทธ์ที่ 3', 'พัฒนาระบบเทคโนโลยีและภาคีเครือข่ายเพื่อการบริหารและการเรียนรู้', [goals[2].id], { sourceCodes: 'SO2,WT1,ST1', standards: 'มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ' })
    ]);
    var now = new Date().toISOString();
    var stages = {};
    ['tows', 'vision', 'mission', 'goal', 'strategy'].forEach(function (stage) { stages[stage] = { at: now, by: 'ข้อมูลตัวอย่าง' }; });
    insert('StrategyPlans', [{ academicYearId: yearId, surveyOpen: true, surveyUntil: iso(addDays(today(), 30)), surveyIntro: '', stagesJson: JSON.stringify(stages) }]);
    var who = function (index) { return (teachers[index % teachers.length] || leaders[0]).id; };
    var std = APP_CONFIG.QA_STANDARD_NAMES;
    var project = function (code, name, strategy, standard, mains, subs, department, budget, status, index) {
      return { academicYearId: yearId, code: code, name: name, strategyId: strategy.id, standard: standard, mainIssues: mains, subIssues: subs, department: department,
        responsibleId: who(index), teamIds: who(index + 3), rationale: 'ผลการวิเคราะห์ความต้องการจำเป็นพบว่า' + name.replace('โครงการ', '') + 'เป็นประเด็นที่ต้องพัฒนาเร่งด่วน',
        objectives: '1. เพื่อพัฒนา' + name.replace('โครงการ', '') + '\n2. เพื่อยกระดับคุณภาพตามมาตรฐานการศึกษา', targetQuantity: 'นักเรียนและครูที่เกี่ยวข้องร้อยละ 100 เข้าร่วมกิจกรรม',
        targetQuality: 'ผู้เข้าร่วมร้อยละ 80 มีผลการพัฒนาในระดับดีขึ้นไป', activities: 'P: วางแผนและแต่งตั้งคณะทำงาน\nD: ดำเนินกิจกรรมตามแผน\nC: ติดตามและประเมินผล\nA: สรุปและปรับปรุง',
        startDate: iso(addDays(today(), -60)), endDate: iso(addDays(today(), 120)), budget: budget, budgetSource: 'เงินอุดหนุนรายหัว', kpi: 'ร้อยละของผู้เข้าร่วมที่บรรลุตามเป้าหมาย',
        expected: 'คุณภาพของผู้เรียนและการจัดการศึกษาดีขึ้นอย่างเป็นรูปธรรม', status: status, fileId: '' };
    };
    var projects = insert('Projects', [
      project('P01', 'โครงการรักการอ่าน อ่านคล่อง เขียนคล่อง', strategies[0], std[0], '1.1', '1.1.1', 'บริหารงานวิชาการ', 15000, 'กำลังดำเนินการ', 0),
      project('P02', 'โครงการพัฒนาทักษะการคิดวิเคราะห์ด้วยโครงงาน', strategies[0], std[0], '1.1', '1.1.2,1.1.3', 'บริหารงานวิชาการ', 12000, 'อนุมัติ', 1),
      project('P03', 'โครงการยกระดับผลสัมฤทธิ์ทางการเรียน', strategies[0], std[0], '1.1', '1.1.5', 'บริหารงานวิชาการ', 20000, 'เสร็จสิ้น', 2),
      project('P04', 'โครงการโรงเรียนคุณธรรม', strategies[0], std[0], '1.2', '1.2.1,1.2.2', 'บริหารงานทั่วไป', 8000, 'เสร็จสิ้น', 3),
      project('P05', 'โครงการพัฒนาครูสู่การจัดการเรียนรู้เชิงรุก (Active Learning)', strategies[1], std[2], '3.1,3.3', '', 'บริหารงานบุคคล', 25000, 'กำลังดำเนินการ', 4),
      project('P06', 'โครงการวัดและประเมินผลเพื่อพัฒนาผู้เรียน', strategies[1], std[2], '3.4,3.5', '', 'บริหารงานวิชาการ', 6000, 'อนุมัติ', 5),
      project('P07', 'โครงการพัฒนาระบบสารสนเทศและห้องเรียนดิจิทัล', strategies[2], std[1], '2.6', '', 'บริหารงานงบประมาณ', 45000, 'เสร็จสิ้น', 6),
      project('P08', 'โครงการสร้างภาคีเครือข่ายการมีส่วนร่วม', strategies[2], std[1], '2.1,2.2,2.5', '', 'บริหารงานทั่วไป', 10000, 'เสนอโครงการ', 7)
    ]);
    var report = function (row, quant, qual, used, satisfaction) {
      var both = [quant, qual];
      return { academicYearId: yearId, projectId: row.id, reporterId: row.responsibleId, reportDate: iso(addDays(today(), -between(rand, 3, 20))),
        activitiesDone: 'ดำเนินกิจกรรมตามแผนครบทุกขั้นตอน ' + row.activities.split('\n').length + ' ขั้น', quantResult: 'นักเรียนและครูเข้าร่วมกิจกรรม ' + between(rand, 85, 100) + '%',
        quantStatus: quant, qualResult: 'ผู้เข้าร่วมร้อยละ ' + between(rand, 72, 92) + ' มีผลการพัฒนาในระดับดีขึ้นไป', qualStatus: qual, budgetUsed: used,
        participants: between(rand, 60, 300), satisfaction: satisfaction, outcome: 'ผู้เรียนมีความกระตือรือร้นและมีผลงานเพิ่มขึ้น',
        problems: 'ระยะเวลาดำเนินกิจกรรมบางช่วงตรงกับกิจกรรมอื่นของโรงเรียน', suggestions: 'ควรวางปฏิทินกิจกรรมให้ชัดเจนตั้งแต่ต้นภาคเรียน',
        result: both.every(function (status) { return status === 'บรรลุ'; }) ? 'บรรลุเป้าหมาย' : both.every(function (status) { return status === 'ไม่บรรลุ'; }) ? 'ไม่บรรลุเป้าหมาย' : 'บรรลุเป้าหมายบางส่วน',
        photo1FileId: '', photo2FileId: '', photo3FileId: '', photo4FileId: '', fileId: '' };
    };
    insert('ProjectReports', [report(projects[2], 'บรรลุ', 'บรรลุ', 19500, 4.52), report(projects[3], 'บรรลุ', 'บรรลุบางส่วน', 7600, 4.31),
      report(projects[6], 'บรรลุ', 'บรรลุ', 44800, 4.65)]);
    return tows.length;
  }

  function byName(sheet) {
    var map = {};
    SheetRepository.all(sheet).forEach(function (row) { map[row.name] = row.id; });
    return map;
  }

  // ค่าที่ต้องใช้ข้ามขั้นตอน อ่านกลับจากตาราง (ไม่เก็บใน Script Property เพราะจำกัดขนาด ~9 KB)
  function people() {
    return mine('Personnel').map(function (row, index) {
      var role = index === 0 ? 'director' : index < 3 ? 'deputy' : index < 35 ? 'teacher' : 'staff';
      return { id: row.id, role: role, group: role === 'teacher' ? Math.floor((index - 3) / 4) : undefined };
    });
  }
  function roomsOf() {
    return mine('Homerooms').map(function (row, index) { return { id: row.id, grade: GRADES.indexOf(row.gradeLevel), n: index, name: row.gradeLevel + '/' + row.roomName }; });
  }
  function studentIdsOf() { return mine('Students').map(function (row) { return row.id; }); }

  // ---------- สถานะ ----------
  function isPending() { return props().getProperty('DEMO_PENDING') === '1'; }
  function isDone() { return props().getProperty('DEMO_DONE') === '1'; }

  // ตั้งให้สร้างข้อมูลตัวอย่างอัตโนมัติเมื่อระบบว่างเปล่า (ครั้งเดียว)
  function scheduleIfEmpty() {
    if (isPending()) return false;
    // ระบบที่มีข้อมูลตัวอย่างอยู่แล้ว: เติมข้อมูลตัวอย่างของเมนูใหม่ครั้งเดียว
    if (isDone()) {
      if (props().getProperty('DEMO_EXTRAS') === '1') return false;
      if (!mine('Students').length) { props().setProperty('DEMO_EXTRAS', '1'); return false; }
      props().setProperty('DEMO_PENDING', '1');
      writeState({ stage: STAGES.indexOf('extras'), img: 0, ids: {} });
      return true;
    }
    if (SheetRepository.all('Students').length > 0 || SheetRepository.all('Personnel').length > 0) { props().setProperty('DEMO_DONE', '1'); return false; }
    props().setProperty('DEMO_PENDING', '1');
    writeState({ stage: 0, img: 0, ids: {} });
    return true;
  }

  function progress(state) {
    var stage = state.stage || 0;
    var total = STAGES.length;
    var within = stage === 0 ? Math.min(1, (state.img || 0) / Math.max(1, state.imgTotal || 93)) : 0;
    return { done: stage >= total, stage: stage, total: total, label: STAGE_LABELS[stage] || 'เสร็จแล้ว',
      percent: Math.min(100, Math.round(((stage + within) / total) * 100)) };
  }

  function status() {
    var state = readState();
    var info = progress(state);
    info.pending = isPending();
    info.loaded = isDone() && mine('Students').length > 0;
    info.counts = { personnel: mine('Personnel').length, students: mine('Students').length, courses: mine('Courses').length };
    return info;
  }

  // เรียกซ้ำจากหน้าเว็บจนกว่า done = true (ใช้ได้เฉพาะตอนที่ระบบตั้งสถานะรอสร้างไว้)
  function step() {
    if (!isPending()) return { done: true, pending: false, percent: 100, label: 'เสร็จแล้ว' };
    var running = Number(props().getProperty('DEMO_RUNNING') || 0);
    if (running && Date.now() - running < 300000) return Object.assign(progress(readState()), { busy: true, pending: true });
    props().setProperty('DEMO_RUNNING', String(Date.now()));
    var started = Date.now();
    var state = readState();
    try {
      while ((state.stage || 0) < STAGES.length && Date.now() - started < TIME_BUDGET_MS) {
        var name = STAGES[state.stage || 0];
        var finished = RUN[name](state);
        if (finished !== false) { state.stage = (state.stage || 0) + 1; }
        writeState(state);
      }
    } finally {
      props().deleteProperty('DEMO_RUNNING');
    }
    if ((state.stage || 0) >= STAGES.length) {
      props().setProperty('DEMO_DONE', '1');
      props().deleteProperty('DEMO_PENDING');
      SheetRepository.clearAllCaches();
    }
    var info = progress(state);
    info.pending = isPending();
    return info;
  }

  // ผู้ดูแลระบบสั่งโหลดใหม่ (ข้อมูลเดิมต้องถูกล้างก่อน)
  function load(token) {
    AuthService.requirePermission(token, 'settings.edit');
    if (mine('Students').length > 0) throw SheetRepository.serviceError('VALIDATION_ERROR', 'มีข้อมูลตัวอย่างอยู่แล้ว กรุณาล้างก่อนโหลดใหม่');
    props().setProperty('DEMO_PENDING', '1');
    props().deleteProperty('DEMO_DONE');
    props().deleteProperty('DEMO_EXTRAS');
    props().deleteProperty('DEMO_RUNNING');
    writeState({ stage: 0, img: 0, ids: {} });
    return status();
  }

  function stepAuthed(token) {
    AuthService.requirePermission(token, 'settings.edit');
    return step();
  }

  // ล้างเฉพาะแถวที่สร้างโดยข้อมูลตัวอย่าง (createdBy = demo) และไฟล์รูปที่เกี่ยวข้อง
  function clear(token, data) {
    var context = AuthService.requirePermission(token, 'settings.edit');
    if (!Core.hasPermission(context.permissions, 'module.toggle')) throw SheetRepository.serviceError('FORBIDDEN', 'เฉพาะผู้ดูแลระบบเท่านั้น');
    if (String((data && data.confirm) || '').trim() !== 'ล้างข้อมูลตัวอย่าง') {
      throw SheetRepository.serviceError('VALIDATION_ERROR', 'พิมพ์คำว่า "ล้างข้อมูลตัวอย่าง" เพื่อยืนยัน');
    }
    var removed = 0;
    SheetRepository.all('Files', { includeDeleted: true }).filter(function (row) { return row.createdBy === ACTOR; }).forEach(function (row) {
      try { DriveApp.getFileById(row.fileId).setTrashed(true); } catch (error) { /* ไฟล์อาจถูกลบไปแล้ว */ }
    });
    var replacement = {};
    DEMO_SHEETS.forEach(function (sheetName) {
      var rows = SheetRepository.all(sheetName, { includeDeleted: true });
      var kept = rows.filter(function (row) { return row.createdBy !== ACTOR; });
      if (kept.length !== rows.length) { removed += rows.length - kept.length; replacement[sheetName] = kept; }
    });
    if (Object.keys(replacement).length) SheetRepository.replaceTablesAtomically(replacement);
    // ปีการศึกษาที่สร้างให้ตัวอย่าง
    var years = SheetRepository.all('AcademicYears', { includeDeleted: true });
    var keptYears = years.filter(function (row) { return row.createdBy !== ACTOR; });
    if (keptYears.length !== years.length) { SheetRepository.replaceTablesAtomically({ AcademicYears: keptYears }); removed += years.length - keptYears.length; }
    props().setProperty('DEMO_DONE', '1');
    props().setProperty('DEMO_EXTRAS', '1');
    props().deleteProperty('DEMO_PENDING');
    props().deleteProperty('DEMO_STATE');
    AuditService.write('DEMO_CLEARED', 'System', 'demo', { removed: removed }, context.user.id);
    SheetRepository.clearAllCaches();
    return { ok: true, removed: removed };
  }

  // ---------- ขั้นตอนสร้างข้อมูล ----------
  var RUN = {};

  function imageKeys() {
    var people = demoPeopleImages_();
    var scenes = demoSceneImages_();
    return Object.keys(people).concat(Object.keys(scenes));
  }

  function imageEntity(key) {
    if (/^(sm|sf)/.test(key)) return 'students';
    if (/^(tm|tf|director)/.test(key)) return 'personnel';
    if (/^sig/.test(key)) return 'signatures';
    return '';
  }
  function imageFolder(key) {
    if (/^(sm|sf)/.test(key)) return 'students';
    if (/^(tm|tf)/.test(key)) return 'personnel';
    if (/^sig/.test(key)) return 'signatures';
    return 'branding';
  }

  RUN.images = function (state) {
    var people = demoPeopleImages_();
    var scenes = demoSceneImages_();
    var keys = imageKeys();
    state.imgTotal = keys.length;
    state.ids = state.ids || {};
    var registry = [];
    var start = state.img || 0;
    var end = Math.min(keys.length, start + IMAGE_CHUNK);
    for (var index = start; index < end; index += 1) {
      var key = keys[index];
      var item = people[key] || scenes[key];
      var extension = item[0] === 'image/png' ? '.png' : '.jpg';
      var file = FolderService.getFolder(imageFolder(key)).createFile(Utilities.newBlob(Utilities.base64Decode(item[1]), item[0], 'ตัวอย่าง-' + key + extension));
      if (imageFolder(key) === 'branding') {
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) { /* บางองค์กรห้ามแชร์ลิงก์ */ }
      }
      state.ids[key] = file.getId();
      if (imageEntity(key)) registry.push({ fileId: file.getId(), fileName: 'ตัวอย่าง-' + key + extension, mimeType: item[0], ownerId: ACTOR, entity: imageEntity(key) });
    }
    insert('Files', registry);
    state.img = end;
    writeState(state);
    return end >= keys.length;
  };

  RUN.master = function (state) {
    var existing = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    if (!existing) {
      var now = today();
      var thaiYear = now.getFullYear() + 543 - (now.getMonth() < 4 ? 1 : 0);
      existing = SheetRepository.insert('AcademicYears', { year: String(thaiYear), term: '1', startsAt: iso(addDays(now, -120)), endsAt: iso(addDays(now, 45)),
        isActive: true }, ACTOR);
    }
    state.yearId = existing.id;
    state.yearStart = String(existing.startsAt || '').slice(0, 10);
    return true;
  };

  function personLine(rand, gender) {
    return { first: pick(rand, gender === 'm' ? MALE : FEMALE), last: pick(rand, SURNAMES) };
  }

  RUN.people = function (state) {
    var rand = random(11);
    var titles = byName('Titles'), positions = byName('Positions'), types = byName('PersonnelTypes'), standings = byName('Standings');
    var divisions = byName('Divisions'), groups = byName('SubjectGroups');
    var ids = state.ids;
    var rows = [];
    var counters = { m: 0, f: 0 };
    function add(spec) {
      var gender = spec.gender;
      var name = spec.first ? { first: spec.first, last: spec.last } : personLine(rand, gender);
      var index = spec.photoKey || ('t' + gender + (counters[gender]++ % 20));
      var seq = rows.length + 1;
      rows.push({ personnelCode: 'T' + pad(seq, 3), titleId: titles[gender === 'm' ? 'นาย' : (rand() < .35 ? 'นาง' : 'นางสาว')],
        firstName: name.first, lastName: name.last, personnelTypeId: types[spec.type || 'ข้าราชการครู'], positionId: positions[spec.position || 'ครู'],
        standingId: standings[spec.standing || pick(rand, ['ครูผู้ช่วย', 'ครูชำนาญการ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ครูเชี่ยวชาญ'])],
        divisionId: divisions[spec.division], subjectGroupId: spec.group === undefined ? '' : groups[GROUP_NAMES[spec.group]], phone: '08' + between(rand, 0, 9) + '-000-' + pad(seq * 7 + 100, 4),
        email: 't' + pad(seq, 3) + '@example.com', startDate: (2000 + between(rand, 0, 22)) + '-' + pad(between(rand, 1, 12), 2) + '-01',
        photoFileId: ids[index] || '', _group: spec.group, _role: spec.role });
    }
    add({ gender: 'm', first: 'สมชาย', last: 'ตัวอย่างดี', position: 'ผู้อำนวยการ', standing: 'ครูเชี่ยวชาญพิเศษ', division: 'ฝ่ายบริหารทั่วไป', photoKey: 'director', role: 'director' });
    add({ gender: 'f', position: 'รองผู้อำนวยการ', standing: 'ครูเชี่ยวชาญ', division: 'ฝ่ายบริหารวิชาการ', role: 'deputy' });
    add({ gender: 'm', position: 'รองผู้อำนวยการ', standing: 'ครูเชี่ยวชาญ', division: 'ฝ่ายบริหารงานบุคคล', role: 'deputy' });
    var divisionByGroup = ['ฝ่ายบริหารวิชาการ', 'ฝ่ายบริหารวิชาการ', 'ฝ่ายบริหารวิชาการ', 'ฝ่ายบริหารทั่วไป', 'ฝ่ายบริหารทั่วไป', 'ฝ่ายบริหารงานบุคคล',
      'ฝ่ายบริหารงบประมาณ', 'ฝ่ายบริหารวิชาการ'];
    for (var group = 0; group < 8; group += 1) {
      for (var t = 0; t < 4; t += 1) {
        var kind = rand();
        add({ gender: rand() < .5 ? 'm' : 'f', division: divisionByGroup[group], group: group, role: 'teacher',
          position: kind < .1 ? 'ครูผู้ช่วย' : 'ครู', type: kind < .1 ? 'ข้าราชการครู' : kind < .18 ? 'พนักงานราชการ' : kind < .22 ? 'ครูอัตราจ้าง' : 'ข้าราชการครู' });
      }
    }
    for (var s = 0; s < 3; s += 1) add({ gender: s === 1 ? 'm' : 'f', type: 'เจ้าหน้าที่ธุรการ', position: 'พนักงานราชการ', standing: 'ครูผู้ช่วย',
      division: s === 0 ? 'ฝ่ายบริหารงบประมาณ' : 'ฝ่ายบริหารทั่วไป', role: 'staff' });
    var meta = rows.map(function (row) { return { group: row._group, role: row._role }; });
    rows.forEach(function (row) { delete row._group; delete row._role; });
    var saved = insert('Personnel', rows);
    insert('PersonnelYears', saved.map(function (row, index) {
      var role = meta[index].role;
      return { academicYearId: state.yearId, personnelId: row.id, positionId: row.positionId, divisionId: row.divisionId, standingId: row.standingId,
        duty: role === 'director' ? 'ผู้บริหารสถานศึกษา' : role === 'deputy' ? 'รองผู้อำนวยการ' : role === 'staff' ? 'งานธุรการ' : pick(rand, ['หัวหน้ากลุ่มสาระฯ', 'งานวัดผล', 'งานทะเบียน', 'งานกิจกรรมนักเรียน', 'งานอนามัย', 'งานห้องสมุด', 'งานแนะแนว', '']),
        status: 'ปฏิบัติงาน' };
    }));
    return true;
  };

  function teachersOf() {
    var table = {};
    people().forEach(function (person) { if (person.role === 'teacher') (table[person.group] = table[person.group] || []).push(person.id); });
    return table;
  }

  RUN.rooms = function (state) {
    var rand = random(23);
    var titles = byName('Titles');
    var teachers = people().filter(function (person) { return person.role === 'teacher'; });
    var homerooms = [];
    var advisor = 0;
    var roomNo = 0;
    GRADES.forEach(function (grade, gradeIndex) {
      for (var number = 1; number <= ROOMS_PER_GRADE[gradeIndex]; number += 1) {
        var coAdvisor = teachers[(advisor + 11) % teachers.length];
        homerooms.push({ academicYearId: state.yearId, gradeLevel: grade, roomName: String(number), advisorId: teachers[advisor % teachers.length].id,
          coAdvisorId: coAdvisor.id, _grade: gradeIndex, _n: roomNo });
        advisor += 1; roomNo += 1;
      }
    });
    var meta = homerooms.map(function (room) { return { grade: room._grade, n: room._n, name: room.gradeLevel + '/' + room.roomName }; });
    homerooms.forEach(function (room) { delete room._grade; delete room._n; });
    var savedRooms = insert('Homerooms', homerooms);
    var rooms = savedRooms.map(function (room, index) { return { id: room.id, grade: meta[index].grade, n: meta[index].n, name: meta[index].name }; });

    var students = [], enrollments = [], meta2 = [];
    var year = today().getFullYear();
    var runningCode = 1;
    rooms.forEach(function (room) {
      var size = between(rand, 22, 28);
      for (var number = 1; number <= size; number += 1) {
        var gender = rand() < .5 ? 'ชาย' : 'หญิง';
        var age = room.grade + 4;
        var name = personLine(rand, gender === 'ชาย' ? 'm' : 'f');
        var photoKey = (gender === 'ชาย' ? 'sm' : 'sf') + between(rand, 0, 19);
        var houseNo = between(rand, 1, 199);
        students.push({ studentCode: '69' + pad(runningCode++, 4), titleId: titles[gender === 'ชาย' ? 'เด็กชาย' : 'เด็กหญิง'], firstName: name.first, lastName: name.last,
          gender: gender, birthDate: (year - age - 1) + '-' + pad(between(rand, 1, 12), 2) + '-' + pad(between(rand, 1, 28), 2),
          nationalId: '0' + pad(between(rand, 0, 99999999), 8) + pad(between(rand, 0, 9999), 4), guardianName: (rand() < .5 ? 'นาย' + pick(rand, MALE) : 'นาง' + pick(rand, FEMALE)) + ' ' + name.last,
          guardianPhone: '08' + between(rand, 0, 9) + '-000-' + pad(between(rand, 0, 9999), 4),
          address: houseNo + ' หมู่ ' + between(rand, 1, 12) + ' ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง', status: 'กำลังศึกษา',
          photoFileId: state.ids[photoKey] || '' });
        meta2.push({ room: room.id, number: number });
      }
    });
    var savedStudents = insert('Students', students);
    insert('StudentEnrollments', savedStudents.map(function (student, index) {
      return { academicYearId: state.yearId, homeroomId: meta2[index].room, number: meta2[index].number, studentId: student.id,
        status: index % 199 === 198 ? 'ย้ายออก' : 'กำลังศึกษา' };
    }));
    insert('StudentInformation', savedStudents.map(function (student, index) {
      var grade = rooms.filter(function (room) { return room.id === meta2[index].room; })[0].grade;
      var base = 14 + grade * 3.2;
      return { academicYearId: state.yearId, studentId: student.id, weight: Math.round(base + between(rand, -3, 8)),
        height: Math.round(100 + grade * 5 + between(rand, -5, 8)), bloodType: pick(rand, ['A', 'B', 'O', 'O', 'AB']),
        disease: rand() < .07 ? pick(rand, ['หอบหืด', 'แพ้อาหารทะเล', 'แพ้ฝุ่น', 'ภูมิแพ้']) : '',
        talent: rand() < .3 ? pick(rand, ['วาดภาพ', 'ร้องเพลง', 'ฟุตบอล', 'เล่นดนตรีไทย', 'คณิตศาสตร์', 'เต้น', 'ว่ายน้ำ', 'ประดิษฐ์งานฝีมือ']) : '',
        notes: '' };
    }));
    return true;
  };

  RUN.timetable = function (state) {
    var groupTeachers = teachersOf();
    var rooms = roomsOf();
    var entries = [], loads = {}, courses = [];
    var groups = byName('SubjectGroups');
    rooms.forEach(function (room) {
      for (var day = 0; day < 5; day += 1) {
        for (var period = 1; period <= 8; period += 1) {
          var group = (room.n + period + day * 3) % 8;
          var teacher = groupTeachers[group][Math.floor(room.n / 6)];
          entries.push({ academicYearId: state.yearId, homeroomId: room.id, weekday: WEEKDAYS[day], period: period, subjectName: SUBJECTS[group],
            subjectGroupId: groups[GROUP_NAMES[group]], teacherId: teacher });
          var loadKey = teacher + '|' + group + '|' + room.id;
          loads[loadKey] = (loads[loadKey] || 0) + 1;
        }
      }
      for (var g = 0; g < 8; g += 1) {
        var level = room.grade < 3 ? '0' + (room.grade + 1) : room.grade < 9 ? '1' + (room.grade - 2) : '2' + (room.grade - 8);
        courses.push({ academicYearId: state.yearId, subjectCode: SUBJECT_PREFIX[g] + level + '101', subjectName: SUBJECTS[g] + ' ' + GRADES[room.grade],
          subjectGroupId: groups[GROUP_NAMES[g]], subjectType: 'พื้นฐาน', credit: g < 2 ? 1.5 : 1, homeroomId: room.id,
          teacherId: groupTeachers[g][Math.floor(room.n / 6)], collectedMax: 70, examMax: 30 });
      }
    });
    insert('TimetableEntries', entries);
    insert('TeachingLoads', Object.keys(loads).map(function (key) {
      var parts = key.split('|');
      var room = rooms.filter(function (item) { return item.id === parts[2]; })[0];
      return { academicYearId: state.yearId, personnelId: parts[0], subjectGroupId: groups[GROUP_NAMES[Number(parts[1])]], subjectName: SUBJECTS[Number(parts[1])] + ' ' + room.name,
        homeroomId: parts[2], hoursPerWeek: loads[key] };
    }));
    insert('Courses', courses);
    return true;
  };

  // ตารางวันเรียนย้อนหลัง (ไม่รวมวันหยุด)
  function schoolDays(state, count) {
    var blocked = SheetRepository.all('CalendarEvents').filter(function (row) { return row.blocksAttendance === true; });
    var days = [];
    var cursor = today();
    var limit = state.yearStart || '0000-00-00';
    for (var guard = 0; guard < 200 && days.length < count; guard += 1) {
      var text = iso(cursor);
      var weekday = cursor.getDay();
      var closed = blocked.some(function (row) { return row.eventDate <= text && (row.endDate || row.eventDate) >= text; });
      if (weekday !== 0 && weekday !== 6 && !closed && text >= limit) days.push(text);
      cursor = addDays(cursor, -1);
    }
    return days.reverse();
  }

  RUN.attendance = function (state) {
    // ต้องมีปฏิทินวันหยุดก่อนเพื่อไม่ให้เช็กชื่อในวันหยุด
    if (!state.calendarDone) { insert('CalendarEvents', calendarRows(state)); state.calendarDone = true; writeState(state); }
    var rand = random(31);
    var days = schoolDays(state, 30);
    var rooms = roomsOf();
    var studentIds = studentIdsOf();
    var entries = SheetRepository.all('TimetableEntries').filter(function (row) { return row.createdBy === ACTOR; });
    var enrollments = mine('StudentEnrollments');
    var byRoom = {};
    enrollments.forEach(function (row) { (byRoom[row.homeroomId] = byRoom[row.homeroomId] || []).push(row.studentId); });
    // นักเรียนกลุ่มเสี่ยงขาดบ่อย
    var frequent = {};
    studentIds.forEach(function (id) { if (rand() < .06) frequent[id] = .3 + rand() * .3; });
    var timetable = {};
    entries.forEach(function (row) { timetable[row.homeroomId + '|' + row.weekday + '|' + row.period] = row; });
    var rows = [];
    days.forEach(function (day) {
      var weekday = WEEKDAYS[new Date(day + 'T00:00:00').getDay() - 1];
      rooms.forEach(function (room) {
        [1, 5].forEach(function (period) {
          var entry = timetable[room.id + '|' + weekday + '|' + period] || {};
          var records = {}, summary = { P: 0, L: 0, E: 0, A: 0, total: 0 };
          (byRoom[room.id] || []).forEach(function (studentId) {
            var chance = rand();
            var risk = frequent[studentId] || 0;
            var normal = rand();
            var status = chance < risk ? 'A' : normal < .93 ? 'P' : normal < .97 ? 'L' : normal < .99 ? 'E' : 'A';
            records[studentId] = { s: status, n: status === 'E' ? 'ลาป่วย' : status === 'L' ? 'มาสาย' : '' };
            summary[status] += 1; summary.total += 1;
          });
          rows.push({ sessionKey: day + '|' + room.id + '|' + period, academicYearId: state.yearId, attendanceDate: day, homeroomId: room.id, period: period,
            subjectName: entry.subjectName || '', teacherId: entry.teacherId || '', summaryJson: JSON.stringify(summary), recordsJson: JSON.stringify(records) });
        });
      });
    });
    for (var offset = 0; offset < rows.length; offset += 400) insert('AttendanceSessions', rows.slice(offset, offset + 400));
    return true;
  };

  RUN.grades = function (state) {
    var rand = random(47);
    var courses = mine('Courses');
    var enrollments = mine('StudentEnrollments');
    var byRoom = {};
    enrollments.forEach(function (row) { (byRoom[row.homeroomId] = byRoom[row.homeroomId] || []).push(row.studentId); });
    var quality = {};
    studentIdsOf().forEach(function (id) { quality[id] = (rand() + rand() + rand()) / 3; });
    function clip(value, high) { return Math.max(0, Math.min(high, Math.round(value))); }
    var rows = courses.map(function (course, index) {
      var scores = {};
      (byRoom[course.homeroomId] || []).forEach(function (studentId) {
        var skill = quality[studentId];
        var special = rand() < .006 ? 'ร' : '';
        scores[studentId] = special ? { c: '', e: '', x: special }
          : { c: clip(70 * (.35 + skill * .75) + between(rand, -6, 6), 70), e: clip(30 * (.3 + skill * .8) + between(rand, -4, 4), 30), x: '' };
      });
      return { courseId: course.id, scoresJson: JSON.stringify(scores), status: index % 10 < 7 ? 'submitted' : 'draft' };
    });
    insert('GradeSheets', rows);
    return true;
  };

  function calendarRows(state) {
    var year = today().getFullYear();
    var rows = [];
    function holiday(date, name, end) { rows.push({ academicYearId: state.yearId, eventDate: date, endDate: end || '', name: name, blocksAttendance: true }); }
    function event(offset, name, span) {
      var start = addDays(today(), offset);
      rows.push({ academicYearId: state.yearId, eventDate: iso(start), endDate: span ? iso(addDays(start, span)) : '', name: name, blocksAttendance: false });
    }
    [[year + '-07-28', 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว'], [year + '-08-12', 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสิริกิติ์ฯ และวันแม่แห่งชาติ'],
      [year + '-10-13', 'วันคล้ายวันสวรรคต พระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร'], [year + '-10-23', 'วันปิยมหาราช'],
      [year + '-12-05', 'วันพ่อแห่งชาติ'], [year + '-12-10', 'วันรัฐธรรมนูญ'], [year + '-12-31', 'วันสิ้นปี'], [(year + 1) + '-01-01', 'วันขึ้นปีใหม่']]
      .forEach(function (item) { holiday(item[0], item[1]); });
    // วันหยุดตัวอย่างที่อยู่ในช่วงเรียนล่าสุด เพื่อทดสอบการไม่เช็กชื่อ
    holiday(iso(addDays(today(), -16)), 'วันหยุดพิเศษของโรงเรียน (ตัวอย่าง)');
    event(-40, 'สอบกลางภาคเรียน', 4); event(-28, 'กิจกรรมวันไหว้ครู'); event(-21, 'กีฬาสีภายใน', 2); event(-9, 'ประชุมผู้ปกครองนักเรียน');
    event(-3, 'อบรมเชิงปฏิบัติการพัฒนาครู'); event(0, 'กิจกรรมเข้าแถวและสวดมนต์ประจำสัปดาห์'); event(2, 'ตรวจสุขภาพนักเรียนประจำภาคเรียน');
    event(5, 'วันภาษาไทยและกิจกรรมส่งเสริมการอ่าน'); event(8, 'ประชุมคณะกรรมการสถานศึกษา'); event(12, 'กิจกรรมค่ายลูกเสือ-เนตรนารี', 2);
    event(16, 'งานวิชาการโรงเรียน (Open House)', 1); event(21, 'นิเทศการสอนภาคเรียนที่ 1'); event(26, 'สอบปลายภาคเรียนที่ 1', 5);
    event(34, 'ประกาศผลการเรียนและส่งงาน ปพ.5'); event(40, 'ปัจฉิมนิเทศนักเรียนชั้นสูงสุด');
    return rows;
  }

  RUN.records = function (state) {
    var rand = random(59);
    var teachers = people().filter(function (person) { return person.role === 'teacher'; });
    var leaders = people().filter(function (person) { return person.role === 'director' || person.role === 'deputy'; });
    var students = studentIdsOf();
    var year = state.yearId;
    function dayAgo(min, max) { return iso(addDays(today(), -between(rand, min, max))); }
    var titles = [['ประกาศวันหยุดชดเชยและการเปลี่ยนแปลงตารางเรียน', true, true], ['กำหนดการสอบกลางภาคเรียน', true, false], ['ประชาสัมพันธ์การตรวจสุขภาพนักเรียน', true, false],
      ['ขอเชิญผู้ปกครองร่วมประชุมประจำภาคเรียน', true, false], ['ผลการแข่งขันกีฬาสีภายใน', true, false], ['แนวปฏิบัติการใช้โทรศัพท์มือถือในโรงเรียน', false, false],
      ['กำหนดส่งเอกสารประกันคุณภาพภายใน', false, false], ['ประชาสัมพันธ์การรับสมัครนักเรียนใหม่', true, false], ['มาตรการป้องกันโรคระบาดในโรงเรียน', true, false],
      ['ขอความร่วมมือรักษาความสะอาดและความปลอดภัย', false, false]];
    insert('Announcements', titles.map(function (item, index) {
      return { title: item[0], publishDate: dayAgo(index * 2, index * 2 + 2), isPinned: item[2], isPublic: item[1],
        body: item[0] + '\n\nโรงเรียนขอประชาสัมพันธ์ให้นักเรียน ผู้ปกครอง และบุคลากรทราบโดยทั่วกัน หากมีข้อสงสัยสามารถติดต่อสอบถามได้ที่ห้องธุรการ ในวันและเวลาราชการ\n(ข้อมูลตัวอย่างเพื่อทดสอบระบบ)', fileId: '' };
    }));

    var supervisions = [];
    for (var s = 0; s < 14; s += 1) {
      var score = between(rand, 68, 98);
      supervisions.push({ academicYearId: year, supervisionDate: dayAgo(3, 60), teacherId: teachers[s * 2 % teachers.length].id, supervisorId: leaders[s % leaders.length].id,
        subjectName: pick(rand, SUBJECTS), score: score, result: score >= 90 ? 'ดีเยี่ยม' : score >= 80 ? 'ดีมาก' : score >= 70 ? 'ดี' : 'พอใช้',
        notes: pick(rand, ['จัดกิจกรรมเน้นผู้เรียนเป็นสำคัญ ใช้สื่อได้เหมาะสม ควรเพิ่มการวัดผลระหว่างเรียน', 'บรรยากาศชั้นเรียนดี นักเรียนมีส่วนร่วม ควรเพิ่มคำถามระดับสูง',
          'ใช้เทคโนโลยีประกอบการสอนได้ดี ควรสรุปบทเรียนร่วมกับนักเรียนให้ชัดเจนขึ้น']), fileId: '', status: 'ประเมินแล้ว' });
    }
    insert('Supervisions', supervisions);

    var pickStudent = function () { return students[Math.floor(rand() * students.length)]; };
    var visits = [];
    for (var v = 0; v < 36; v += 1) {
      visits.push({ academicYearId: year, visitDate: dayAgo(2, 100), studentId: pickStudent(), visitorId: teachers[v % teachers.length].id,
        livingWith: pick(rand, ['บิดามารดา', 'บิดามารดา', 'บิดา', 'มารดา', 'ญาติ']), economicStatus: pick(rand, ['พอเพียง', 'พอเพียง', 'ขาดแคลน', 'ยากจน']),
        findings: pick(rand, ['บ้านมีสภาพเหมาะสม ผู้ปกครองให้ความร่วมมือดี นักเรียนมีที่อ่านหนังสือ', 'ครอบครัวประกอบอาชีพเกษตรกรรม รายได้ไม่แน่นอน ควรติดตามเรื่องทุนการศึกษา',
          'นักเรียนอยู่กับญาติ ผู้ปกครองสูงอายุ ควรประสานเรื่องการเดินทางมาโรงเรียน', 'ครอบครัวอบอุ่น นักเรียนช่วยงานบ้านตามวัย']), photoFileId: '' });
    }
    insert('HomeVisits', visits);

    var support = [];
    for (var c = 0; c < 45; c += 1) {
      var group = pick(rand, ['ปกติ', 'เสี่ยง', 'เสี่ยง', 'มีปัญหา']);
      support.push({ academicYearId: year, studentId: pickStudent(), group: group, issue: pick(rand, ['การเรียน', 'สุขภาพ', 'ครอบครัว', 'พฤติกรรม', 'เศรษฐกิจ']),
        action: pick(rand, ['ครูที่ปรึกษาพูดคุยและติดตามอย่างใกล้ชิด จัดกิจกรรมเสริมทักษะ', 'ประสานผู้ปกครองเพื่อร่วมวางแผนช่วยเหลือ', 'ส่งต่อครูแนะแนวเพื่อให้คำปรึกษา', 'ให้ความช่วยเหลือด้านอุปกรณ์การเรียนและอาหารกลางวัน']),
        status: pick(rand, ['กำลังดำเนินการ', 'ติดตามผล', 'ติดตามผล', 'ส่งต่อ', 'ยุติ']), advisorId: teachers[c % teachers.length].id });
    }
    insert('SupportCases', support);

    var sdq = [];
    for (var d = 0; d < 70; d += 1) {
      var values = { academicYearId: year, studentId: pickStudent(), assessor: pick(rand, ['ครู', 'ผู้ปกครอง', 'นักเรียน']), emotional: between(rand, 0, 6), conduct: between(rand, 0, 6),
        hyperactivity: between(rand, 0, 7), peer: between(rand, 0, 6), prosocial: between(rand, 4, 10) };
      sdq.push(EntityService.COMPUTE.sdq(values));
    }
    insert('SdqAssessments', sdq);

    var scholarships = [];
    for (var h = 0; h < 26; h += 1) {
      scholarships.push({ academicYearId: year, studentId: pickStudent(), name: pick(rand, ['ทุนเรียนดี', 'ทุนช่วยเหลือค่าใช้จ่ายรายหัว', 'ทุนพระราชทานตัวอย่าง', 'ทุนสนับสนุนการศึกษาจากชุมชน', 'ทุนเสมาพัฒนาชีวิต']),
        source: pick(rand, ['กองทุนโรงเรียน', 'ภาคเอกชน (ตัวอย่าง)', 'มูลนิธิตัวอย่าง', 'องค์กรปกครองส่วนท้องถิ่น']), amount: pick(rand, [1000, 2000, 3000, 5000, 8000]), receivedDate: dayAgo(5, 110) });
    }
    insert('Scholarships', scholarships);

    var awardTitles = [['นักเรียน', 'ชนะเลิศการแข่งขันตอบปัญหาวิทยาศาสตร์'], ['นักเรียน', 'รางวัลเหรียญทองการแข่งขันศิลปหัตถกรรม'], ['นักเรียน', 'ชนะเลิศการแข่งขันกรีฑา'],
      ['นักเรียน', 'รางวัลชมเชยการประกวดมารยาทไทย'], ['ครู', 'ครูผู้สอนดีเด่น'], ['ครู', 'รางวัลครูผู้สร้างนวัตกรรมการเรียนรู้'], ['โรงเรียน', 'โรงเรียนสีขาวปลอดอบายมุข'],
      ['โรงเรียน', 'รางวัลสถานศึกษาพอเพียง'], ['นักเรียน', 'รางวัลเหรียญเงินการแข่งขันทักษะภาษาอังกฤษ'], ['ครู', 'รางวัลผลงานวิจัยในชั้นเรียนดีเด่น']];
    var awards = [];
    for (var a = 0; a < 30; a += 1) {
      var item = awardTitles[a % awardTitles.length];
      awards.push({ academicYearId: year, ownerType: item[0], personnelId: item[0] === 'ครู' ? teachers[a % teachers.length].id : '', studentId: item[0] === 'นักเรียน' ? pickStudent() : '',
        title: item[1], level: pick(rand, ['โรงเรียน', 'เขตพื้นที่', 'เขตพื้นที่', 'จังหวัด', 'ภาค', 'ประเทศ']), rank: pick(rand, ['ชนะเลิศ', 'รองชนะเลิศอันดับ 1', 'เหรียญทอง', 'เหรียญเงิน', 'ชมเชย']),
        awardDate: dayAgo(5, 200), organizer: pick(rand, ['สำนักงานเขตพื้นที่การศึกษา (ตัวอย่าง)', 'กระทรวงศึกษาธิการ (ตัวอย่าง)', 'องค์กรปกครองส่วนท้องถิ่น (ตัวอย่าง)']), fileId: '' });
    }
    insert('Awards', awards);

    var portfolios = [];
    for (var p = 0; p < 24; p += 1) {
      portfolios.push({ academicYearId: year, personnelId: teachers[p % teachers.length].id, category: pick(rand, ['การจัดการเรียนรู้', 'การพัฒนาตนเอง', 'งานที่ได้รับมอบหมาย']),
        title: pick(rand, ['สื่อการสอนแบบโต้ตอบ', 'ผลการอบรมพัฒนาวิชาชีพ', 'โครงการส่งเสริมการอ่านออกเขียนได้', 'นวัตกรรมการวัดผลประเมินผล', 'กิจกรรมชุมชนการเรียนรู้ทางวิชาชีพ (PLC)']),
        description: 'สรุปผลงานและหลักฐานประกอบ (ข้อมูลตัวอย่างเพื่อทดสอบระบบ)' });
    }
    insert('Portfolios', portfolios);
    return true;
  };

  RUN.documents = function (state) {
    var rand = random(71);
    var year = state.yearId;
    var teachers = people().filter(function (person) { return person.role === 'teacher'; });
    var sections = [['ส่วนที่ 1', 'ข้อมูลพื้นฐานของสถานศึกษา', 'ข้อมูลทั่วไป ที่ตั้ง จำนวนนักเรียน ครูและบุคลากร ข้อมูลผลการดำเนินงานที่ผ่านมา'],
      ['ส่วนที่ 2', 'ผลการประเมินตนเอง: คุณภาพของผู้เรียน', 'ผู้เรียนมีผลสัมฤทธิ์ทางการเรียนตามเกณฑ์ที่สถานศึกษากำหนด มีทักษะการอ่าน คิดวิเคราะห์ และการสื่อสารในระดับดี'],
      ['ส่วนที่ 3', 'ผลการประเมินตนเอง: กระบวนการบริหารและการจัดการ', 'สถานศึกษามีการวางแผนพัฒนาคุณภาพการศึกษาอย่างเป็นระบบ ผู้บริหารมีภาวะผู้นำและเปิดโอกาสให้ทุกฝ่ายมีส่วนร่วม'],
      ['ส่วนที่ 4', 'ผลการประเมินตนเอง: การจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ', 'ครูจัดกิจกรรมการเรียนรู้ที่หลากหลาย ใช้สื่อและเทคโนโลยี และมีการวัดประเมินผลตามสภาพจริง'],
      ['ส่วนที่ 5', 'จุดเด่น จุดควรพัฒนา และแนวทางพัฒนา', 'จุดเด่น: ครูและชุมชนมีส่วนร่วม จุดควรพัฒนา: ทักษะการคิดขั้นสูงของผู้เรียน แนวทาง: พัฒนาครูและกิจกรรมเสริม'],
      ['ส่วนที่ 6', 'ความต้องการช่วยเหลือ', 'ต้องการการสนับสนุนงบประมาณด้านสื่อ อุปกรณ์ และการพัฒนาบุคลากรอย่างต่อเนื่อง']];
    insert('SarSections', sections.map(function (item, index) { return { academicYearId: year, sectionNo: index + 1, title: item[0] + ' ' + item[1], content: item[2] + '\n(ข้อมูลตัวอย่างเพื่อทดสอบระบบ)', fileId: '' }; }));

    var standards = ['มาตรฐานที่ 1 คุณภาพของผู้เรียน', 'มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ', 'มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ'];
    var indicators = [['ผลสัมฤทธิ์ทางการเรียนระดับสถานศึกษา', 'ร้อยละ 70', 'ร้อยละ 74'], ['ผู้เรียนอ่านออกเขียนได้ตามเกณฑ์', 'ร้อยละ 95', 'ร้อยละ 97'],
      ['คุณลักษณะอันพึงประสงค์', 'ร้อยละ 90', 'ร้อยละ 92'], ['เป้าหมายวิสัยทัศน์และพันธกิจ', 'ชัดเจน', 'ชัดเจน'], ['ระบบบริหารคุณภาพของสถานศึกษา', 'มีระบบ', 'มีระบบ'],
      ['การพัฒนาวิชาชีพครู', 'ร้อยละ 90', 'ร้อยละ 88'], ['การจัดสภาพแวดล้อมและแหล่งเรียนรู้', 'ระดับดี', 'ระดับดี'], ['การใช้เทคโนโลยีดิจิทัล', 'ระดับดี', 'ระดับพอใช้'],
      ['การจัดการเรียนรู้ Active Learning', 'ร้อยละ 80', 'ร้อยละ 82'], ['การวัดและประเมินผลตามสภาพจริง', 'ร้อยละ 80', 'ร้อยละ 79'], ['การให้ข้อมูลย้อนกลับ', 'ระดับดี', 'ระดับดี'],
      ['การมีส่วนร่วมของผู้ปกครองและชุมชน', 'ร้อยละ 80', 'ร้อยละ 85'], ['ระบบดูแลช่วยเหลือนักเรียน', 'ครอบคลุมทุกคน', 'ครอบคลุมทุกคน'], ['การนิเทศภายใน', '2 ครั้ง/ภาคเรียน', '2 ครั้ง/ภาคเรียน'],
      ['การเผยแพร่ผลงานและนวัตกรรม', '10 ชิ้น', '12 ชิ้น']];
    insert('QaIndicators', indicators.map(function (item, index) {
      return { academicYearId: year, standard: standards[Math.floor(index / 5)], indicator: item[0], target: item[1], result: item[2],
        level: pick(rand, ['ยอดเยี่ยม', 'ดีเลิศ', 'ดีเลิศ', 'ดี']), evidence: 'เอกสารและภาพถ่ายกิจกรรมประกอบ (ข้อมูลตัวอย่าง)', fileId: '' };
    }));

    insert('Policies', [['นโยบายการดูแลช่วยเหลือนักเรียน', 'นักเรียน'], ['นโยบายความปลอดภัยในสถานศึกษา', 'ความปลอดภัย'], ['นโยบายการพัฒนาคุณภาพผู้เรียน', 'วิชาการ'], ['นโยบายส่งเสริมการอ่าน', 'วิชาการ'],
      ['นโยบายโรงเรียนปลอดขยะ', 'สิ่งแวดล้อม'], ['นโยบายการใช้เทคโนโลยีดิจิทัล', 'เทคโนโลยี'], ['นโยบายส่งเสริมสุขภาพนักเรียน', 'สุขภาพ'], ['นโยบายการมีส่วนร่วมของชุมชน', 'ชุมชน']]
      .map(function (item, index) { return { title: item[0], category: item[1], effectiveDate: iso(addDays(today(), -30 * (index + 1))), description: 'สาระสำคัญโดยสรุป (ข้อมูลตัวอย่างเพื่อทดสอบระบบ)', fileId: '' }; }));

    var documentRows = [];
    for (var d = 0; d < 26; d += 1) {
      var direction = pick(rand, ['หนังสือรับ', 'หนังสือรับ', 'หนังสือส่ง', 'คำสั่ง', 'ประกาศ', 'บันทึกข้อความ']);
      documentRows.push({ documentNo: 'ศธ 04000/' + between(rand, 1, 999), documentDate: iso(addDays(today(), -d * 5)),
        title: pick(rand, ['ขอความอนุเคราะห์เข้าร่วมกิจกรรมทางวิชาการ', 'แจ้งกำหนดการประชุมผู้บริหารสถานศึกษา', 'รายงานผลการดำเนินงานประจำเดือน', 'แต่งตั้งคณะกรรมการดำเนินงานโครงการ', 'ขอส่งรายชื่อนักเรียนเข้าร่วมการแข่งขัน', 'ประชาสัมพันธ์การอบรมออนไลน์']),
        direction: direction, fromTo: pick(rand, ['สำนักงานเขตพื้นที่การศึกษา (ตัวอย่าง)', 'องค์กรปกครองส่วนท้องถิ่น (ตัวอย่าง)', 'ผู้อำนวยการโรงเรียน', 'ฝ่ายบริหารวิชาการ']), description: 'ข้อมูลตัวอย่างเพื่อทดสอบระบบ', fileId: '' });
    }
    insert('Documents', documentRows);

    // ผู้ลงนาม ปพ.5/ปพ.6 และภาพลายเซ็น
    var roles = ['หัวหน้างานวัดผล', 'หัวหน้างานทะเบียน', 'รองผู้อำนวยการฝ่ายวิชาการ', 'ผู้อำนวยการโรงเรียน'];
    var director = people().filter(function (person) { return person.role === 'director'; })[0];
    var deputy = people().filter(function (person) { return person.role === 'deputy'; })[0];
    var signers = [teachers[0], teachers[1], deputy, director];
    var allowedRoles = ['หัวหน้างานวัดผล', 'หัวหน้างานทะเบียน', 'รองผู้อำนวยการฝ่ายวิชาการ', 'ผู้อำนวยการโรงเรียน'];
    insert('ApprovalPositions', signers.map(function (person, index) { return { academicYearId: year, role: allowedRoles[index] || roles[index], personnelId: person.id }; }));
    insert('Signatures', signers.map(function (person, index) { return { personnelId: person.id, signatureFileId: state.ids['sig' + index] || '', note: 'ลายเซ็นตัวอย่าง' }; }));

    // แผนการสอนพร้อมไฟล์ HTML
    var plans = [], registry = [];
    var folder = FolderService.getFolder('lesson-plans');
    var planCount = 0;
    roomsOf().forEach(function (room) {
      if (room.n % 2 !== 0 || planCount >= 48) return;
      for (var g = 0; g < 8 && planCount < 48; g += 2) {
        var group = (room.n + g) % 8;
        var teacherIds = teachersOf()[group];
        var teacherId = teacherIds[Math.floor(room.n / 6)];
        var title = 'แผนการจัดการเรียนรู้ ' + SUBJECTS[group] + ' ' + GRADES[room.grade] + ' ' + UNITS[planCount % 4];
        var html = lessonHtml(title, SUBJECTS[group], GRADES[room.grade]);
        var file = folder.createFile(Utilities.newBlob(html, 'text/html', title + '.html'));
        registry.push({ fileId: file.getId(), fileName: title + '.html', mimeType: 'text/html', ownerId: ACTOR, entity: 'lesson-plans' });
        plans.push({ academicYearId: year, teacherId: teacherId, subjectName: SUBJECTS[group], gradeLevel: GRADES[room.grade], unit: UNITS[planCount % 4], title: title, fileId: file.getId(),
          postTeachingNote: pick(rand, ['นักเรียนส่วนใหญ่เข้าใจเนื้อหา ควรเพิ่มกิจกรรมฝึกปฏิบัติ', 'กิจกรรมกลุ่มได้ผลดี นักเรียนมีส่วนร่วมสูง', 'ใช้เวลาเกินแผน ควรปรับกิจกรรมนำเข้าสู่บทเรียนให้กระชับ', '']) });
        planCount += 1;
      }
    });
    insert('Files', registry);
    insert('LessonPlans', plans);
    return true;
  };

  function lessonHtml(title, subject, level) {
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + title + '</title></head><body style="font-family:sans-serif;line-height:1.7;max-width:800px;margin:24px auto">' +
      '<h2>' + title + '</h2><p>รายวิชา: ' + subject + ' | ระดับชั้น: ' + level + ' | เวลา 4 ชั่วโมง</p>' +
      '<h3>1. มาตรฐานการเรียนรู้/ตัวชี้วัด</h3><p>นักเรียนเข้าใจหลักการสำคัญและสามารถนำไปประยุกต์ใช้ได้ตามระดับชั้น</p>' +
      '<h3>2. จุดประสงค์การเรียนรู้</h3><ul><li>อธิบายสาระสำคัญของหน่วยการเรียนรู้ได้</li><li>ปฏิบัติกิจกรรมตามที่กำหนดได้ถูกต้อง</li><li>มีเจตคติที่ดีต่อการเรียนรู้</li></ul>' +
      '<h3>3. กิจกรรมการเรียนรู้</h3><ol><li>ขั้นนำ: สนทนา ทบทวนความรู้เดิม</li><li>ขั้นสอน: ครูอธิบายและสาธิต นักเรียนฝึกปฏิบัติเป็นกลุ่ม</li><li>ขั้นสรุป: นักเรียนร่วมกันสรุปและตอบคำถามท้ายบท</li></ol>' +
      '<h3>4. สื่อและแหล่งเรียนรู้</h3><p>ใบความรู้ ใบงาน สื่อนำเสนอ และแหล่งเรียนรู้ในโรงเรียน</p>' +
      '<h3>5. การวัดและประเมินผล</h3><p>สังเกตพฤติกรรม ตรวจใบงาน แบบทดสอบท้ายหน่วย</p><p><i>(เอกสารตัวอย่างที่สร้างขึ้นเพื่อทดสอบระบบ)</i></p></body></html>';
  }

  // ---------- ข้อมูลตัวอย่างของระบบงานใหม่ (ดูแลนักเรียน 5.1–5.6 ความปลอดภัย นิเทศ PLC ว.23 SWOT ลงเวลา) ----------
  // ระบบที่เคยโหลดข้อมูลตัวอย่างไว้แล้วจะได้ขั้นนี้เพิ่มอัตโนมัติหนึ่งครั้ง (DEMO_EXTRAS)
  var DEMO_CENTER = { lat: 18.7883, lng: 98.9853 };

  function near(rand, spread) {
    return { latitude: String(Math.round((DEMO_CENTER.lat + (rand() - 0.5) * spread) * 1e6) / 1e6),
      longitude: String(Math.round((DEMO_CENTER.lng + (rand() - 0.5) * spread) * 1e6) / 1e6) };
  }

  RUN.extras = function (state) {
    var rand = random(97);
    var active = SheetRepository.all('AcademicYears').filter(function (row) { return row.isActive === true; })[0];
    var yearId = state.yearId || (active ? active.id : '');
    var staff = people();
    var teachers = staff.filter(function (person) { return person.role === 'teacher'; });
    var leaders = staff.filter(function (person) { return person.role === 'director' || person.role === 'deputy'; });
    var students = mine('Students');
    if (!yearId || !teachers.length || !students.length) return true;
    function dayAgo(min, max) { return iso(addDays(today(), -between(rand, min, max))); }
    function teacher() { return pick(rand, teachers).id; }

    // ตำแหน่งโรงเรียนสำหรับแผนที่ (ไม่ทับค่าที่ผู้ดูแลระบบตั้งไว้แล้ว)
    var checkinConfig = {};
    try { checkinConfig = JSON.parse(props().getProperty('CHECKIN_CONFIG') || '{}') || {}; } catch (error) { checkinConfig = {}; }
    if (!checkinConfig.latitude) {
      props().setProperty('CHECKIN_CONFIG', JSON.stringify(Object.assign({ startTime: '08:00', lateTime: '08:30', endTime: '16:30', useGps: false, radius: 200 },
        checkinConfig, { latitude: String(DEMO_CENTER.lat), longitude: String(DEMO_CENTER.lng) })));
    }

    // 5.1 ครอบครัว
    var jobs = ['เกษตรกร', 'รับจ้างทั่วไป', 'ค้าขาย', 'พนักงานบริษัท', 'รับราชการ', 'ธุรกิจส่วนตัว'];
    insert('StudentFamilies', students.filter(function () { return rand() < 0.6; }).map(function (student) {
      var status = pick(rand, ['อยู่ด้วยกัน', 'อยู่ด้วยกัน', 'อยู่ด้วยกัน', 'แยกกันอยู่', 'หย่าร้าง', 'บิดาถึงแก่กรรม']);
      return { studentId: student.id, parentStatus: status, livingWith: status === 'อยู่ด้วยกัน' ? 'บิดาและมารดา' : pick(rand, ['มารดา', 'ญาติ', 'บิดา']),
        siblings: between(rand, 1, 4), childOrder: 1, fatherName: 'นาย' + pick(rand, MALE) + ' ' + student.lastName, fatherJob: pick(rand, jobs),
        fatherIncome: pick(rand, [6000, 9000, 12000, 15000, 25000]), motherName: 'นาง' + pick(rand, FEMALE) + ' ' + student.lastName, motherJob: pick(rand, jobs),
        motherIncome: pick(rand, [5000, 8000, 10000, 15000, 20000]), guardianName: student.guardianName, guardianRelation: pick(rand, ['บิดา', 'มารดา', 'ปู่/ย่า', 'ตา/ยาย']),
        guardianPhone: student.guardianPhone, notes: '' };
    }));

    // 5.2 เยี่ยมบ้านพร้อมพิกัด
    var visits = [];
    students.forEach(function (student) {
      if (rand() > 0.35) return;
      var economic = pick(rand, ['พอเพียง', 'พอเพียง', 'พอเพียง', 'ขาดแคลน', 'ยากจน']);
      visits.push(Object.assign({ academicYearId: yearId, visitDate: dayAgo(3, 110), studentId: student.id, visitorId: teacher(),
        livingWith: pick(rand, ['บิดามารดา', 'บิดามารดา', 'มารดา', 'ญาติ']), economicStatus: economic,
        findings: pick(rand, ['ผู้ปกครองให้ความร่วมมือดี นักเรียนมีที่อ่านหนังสือ', 'ควรติดตามเรื่องค่าใช้จ่ายและทุนการศึกษา', 'นักเรียนช่วยงานบ้านตามวัย ครอบครัวอบอุ่น']),
        photoFileId: '', informant: pick(rand, ['บิดา', 'มารดา', 'ยาย', 'ป้า']), distanceKm: between(rand, 1, 15), travelMinutes: between(rand, 5, 45),
        transport: pick(rand, ['เดิน', 'จักรยาน', 'รถจักรยานยนต์', 'รถรับส่งนักเรียน', 'ผู้ปกครองมาส่ง']), housingType: pick(rand, ['บ้านตนเอง', 'บ้านตนเอง', 'บ้านเช่า', 'อาศัยญาติ']),
        houseCondition: pick(rand, ['มั่นคงถาวร/ปลอดภัย', 'สะอาดเป็นระเบียบ', 'ทรุดโทรม/ต้องซ่อมแซม']),
        familyRelation: rand() < 0.85 ? 'อบอุ่น/เข้าใจกันดี' : 'ขัดแย้งบ้าง/ห่างเหิน', debt: economic === 'ยากจน' ? 'มีหนี้สินและเดือดร้อนมาก' : pick(rand, ['ไม่มีหนี้สิน', 'มีหนี้สินแต่พอชำระได้']),
        community: 'ชุมชนสงบ มีร้านค้าและวัดใกล้บ้าน', homeBehavior: pick(rand, ['ช่วยงานบ้าน ทำการบ้านสม่ำเสมอ', 'ใช้โทรศัพท์เล่นเกมค่อนข้างมาก', 'ช่วยครอบครัวค้าขายหลังเลิกเรียน']),
        parentConcern: pick(rand, ['อยากให้ลูกอ่านหนังสือคล่องขึ้น', 'กังวลเรื่องการเดินทางช่วงฝนตก', 'อยากให้โรงเรียนช่วยเรื่องทุนการศึกษา', '']) }, near(rand, 0.12)));
    });
    insert('HomeVisits', visits);

    // 5.3 คัดกรอง
    var level = function () { var value = rand(); return value < 0.8 ? 'ปกติ' : value < 0.95 ? 'เสี่ยง' : 'มีปัญหา'; };
    insert('Screenings', students.filter(function () { return rand() < 0.6; }).map(function (student) {
      return EntityService.COMPUTE.screenings({ academicYearId: yearId, screenDate: dayAgo(30, 100), studentId: student.id, learning: level(), health: level(),
        economy: level(), protection: rand() < 0.97 ? 'ปกติ' : 'เสี่ยง', drug: rand() < 0.98 ? 'ปกติ' : 'เสี่ยง', sexual: 'ปกติ', screenerId: teacher(), notes: '' });
    }));

    // 5.4 ให้คำปรึกษา 5.5 ส่งต่อ 5.6 AAR
    var pickStudent = function () { return pick(rand, students).id; };
    var counsel = [];
    for (var c = 0; c < 40; c += 1) {
      counsel.push({ academicYearId: yearId, counselDate: dayAgo(1, 90), studentId: pickStudent(), issueType: pick(rand, ['ด้านการเรียน', 'ด้านสุขภาพ', 'ด้านการปรับตัวและพฤติกรรม', 'ด้านครอบครัวและส่วนตัว']),
        statement: pick(rand, ['ส่งงานไม่ครบหลายวิชา', 'มีปัญหาทะเลาะกับเพื่อนในห้อง', 'รู้สึกเครียดเรื่องการเรียน', 'ผู้ปกครองแยกทางกัน นักเรียนเสียใจ']),
        solution: 'รับฟังอย่างตั้งใจ ร่วมกันวางแผนแก้ไข และนัดติดตามผลทุกสัปดาห์', counselorId: teacher(),
        followUp: pick(rand, ['นักเรียนส่งงานครบมากขึ้น', 'ความสัมพันธ์กับเพื่อนดีขึ้น', 'ยังต้องติดตามต่อ']), status: pick(rand, ['ติดตามผล', 'ดีขึ้น', 'ดีขึ้น', 'ยุติ', 'ส่งต่อ']) });
    }
    insert('Counselings', counsel);
    var referrals = [];
    for (var r = 0; r < 25; r += 1) {
      var external = rand() < 0.4;
      referrals.push({ academicYearId: yearId, referDate: dayAgo(1, 90), studentId: pickStudent(), referType: external ? 'ส่งต่อหน่วยงานภายนอก (SPS)' : 'ส่งต่อภายในสถานศึกษา',
        destination: external ? pick(rand, ['โรงพยาบาลส่งเสริมสุขภาพตำบล (ตัวอย่าง)', 'ศูนย์คุ้มครองเด็ก (ตัวอย่าง)', 'สถานีตำรวจ (ตัวอย่าง)']) : pick(rand, ['ครูแนะแนว', 'งานอนามัยโรงเรียน', 'ฝ่ายกิจการนักเรียน']),
        reason: 'พฤติกรรมเปลี่ยนแปลงและต้องการความช่วยเหลือเฉพาะทาง', teacherAction: 'พูดคุยให้คำปรึกษาเบื้องต้นและแจ้งผู้ปกครองแล้ว',
        requestDetail: 'ขอให้ประเมินเพิ่มเติมและให้คำแนะนำแนวทางช่วยเหลือ', status: pick(rand, ['ส่งต่อแล้ว', 'ติดตามผล', 'ได้รับการช่วยเหลือ', 'ยุติ']), referrerId: teacher(), fileId: '' });
    }
    insert('Referrals', referrals);
    // ห้องรับฟัง: เรื่องที่นักเรียนแจ้งเอง (ข้อมูลจำลอง) มีทั้งไม่ระบุตัวตน ระบุชื่อ และมีข้อความโต้ตอบ
    var concernSamples = [
      ['เรื่องการเรียน', 'ปกติ', 'รอรับเรื่อง', true, '(ข้อมูลตัวอย่าง) ช่วงนี้ตามเพื่อนไม่ทันวิชาคณิตศาสตร์ รู้สึกเครียดและไม่กล้าถามครู', ''],
      ['เพื่อนและความสัมพันธ์', 'ปกติ', 'รับเรื่องแล้ว', false, '(ข้อมูลตัวอย่าง) ทะเลาะกับเพื่อนสนิทและไม่มีใครคุยด้วย อยากให้ครูช่วยไกล่เกลี่ย', 'ครูเห็นข้อความแล้ว พรุ่งนี้พักเที่ยงมาคุยกันที่ห้องแนะแนวนะ'],
      ['ถูกรังแก/ถูกข่มขู่', 'เร่งด่วน', 'รอรับเรื่อง', true, '(ข้อมูลตัวอย่าง) มีรุ่นพี่ชอบล้อและเรียกเก็บเงินตอนเลิกเรียนหน้าประตูโรงเรียน', ''],
      ['ครอบครัว', 'เร่งด่วน', 'กำลังให้คำปรึกษา', false, '(ข้อมูลตัวอย่าง) ที่บ้านมีปัญหาเรื่องเงิน พ่อแม่ทะเลาะกันบ่อย ไม่มีสมาธิเรียน', 'ครูรับเรื่องแล้วนะ ครูนัดคุยกับเธอสัปดาห์นี้'],
      ['ความรู้สึก เครียด เศร้า กังวล', 'ฉุกเฉิน', 'รอรับเรื่อง', true, '(ข้อมูลตัวอย่าง) ข้อความที่ระบบจัดเป็นระดับฉุกเฉิน ใช้ดูหน้าจอและขั้นตอนการรับมือเท่านั้น', ''],
      ['สุขภาพกาย', 'ปกติ', 'ปิดเรื่อง', false, '(ข้อมูลตัวอย่าง) ปวดหัวบ่อยตอนบ่าย ไม่แน่ใจว่าต้องไปหาหมอไหม', 'ครูพาไปห้องพยาบาลและแจ้งผู้ปกครองแล้ว ขอให้ดูแลตัวเองนะ']
    ];
    insert('StudentConcerns', concernSamples.map(function (item, index) {
      var named = !item[3] && students.length > 0;
      var thread = item[5] ? [{ by: 't', at: iso(addDays(today(), -1)) + 'T09:00:00.000Z', name: 'ครูแนะแนว (ตัวอย่าง)', text: item[5] }] : [];
      return { academicYearId: yearId, receivedDate: dayAgo(0, 6), trackingCode: 'DMO' + (index + 1) + '-' + pad(index + 1, 4), topic: item[0], aboutWho: 'ตัวฉันเอง',
        urgency: item[1], message: item[4], isAnonymous: item[3], studentId: named ? pickStudent() : '', claimedStudent: '',
        contactNote: named ? 'พักเที่ยง' : '', preferred: 'ใครก็ได้', status: item[2], assigneeId: item[2] === 'รอรับเรื่อง' ? '' : teacher(), followUpDate: '',
        internalNote: item[2] === 'ปิดเรื่อง' ? 'ประสานผู้ปกครองและตรวจสุขภาพเบื้องต้นแล้ว' : '', counselingId: '',
        threadJson: JSON.stringify(thread), hasNewMessage: false };
    }));
    insert('AarRecords', [['ดูแลช่วยเหลือนักเรียน', 'การเยี่ยมบ้านนักเรียนภาคเรียนที่ 1'], ['ความปลอดภัย', 'เหตุนักเรียนหกล้มบริเวณบันได'], ['กิจกรรม/โครงการ', 'กิจกรรมกีฬาสีภายใน'],
      ['ความปลอดภัย', 'การซ้อมอพยพหนีไฟ'], ['ดูแลช่วยเหลือนักเรียน', 'การคัดกรองนักเรียนกลุ่มเสี่ยง'], ['กิจกรรม/โครงการ', 'ค่ายลูกเสือ-เนตรนารี']].map(function (item, index) {
      return { academicYearId: yearId, aarDate: dayAgo(index * 7, index * 7 + 6), context: item[0], eventName: item[1], studentId: '', expected: 'ดำเนินการครบตามแผน ผู้เกี่ยวข้องปลอดภัย',
        actual: 'ดำเนินการได้ตามแผนเป็นส่วนใหญ่ มีบางขั้นตอนล่าช้า', rootCause: 'การสื่อสารระหว่างฝ่ายยังไม่ชัดเจน', lessons: 'ควรแบ่งหน้าที่และซักซ้อมล่วงหน้า',
        improvement: 'จัดทำคู่มือขั้นตอนและประชุมเตรียมงานก่อนทุกครั้ง', fileId: '' };
    }));

    // ความปลอดภัย: เหตุ จุดเสี่ยง แผน SPS
    var groups = APP_CONFIG.HAZARD_GROUPS;
    var typeByGroup = [['อาคารเรียน สิ่งก่อสร้าง', 'ยานพาหนะ/การเดินทาง', 'การจัดกิจกรรม', 'เครื่องมือ อุปกรณ์'], ['การทะเลาะวิวาท', 'การกลั่นแกล้งรังแก (Bully)'],
      ['การถูกปล่อยปละละเลย ทอดทิ้ง', 'ภัยไซเบอร์'], ['ภาวะจิตเวช/ความเครียด', 'ติดเกม', 'โรคระบาด', 'ภาวะทุพโภชนาการ']];
    var places = ['สนามฟุตบอล', 'บันไดอาคาร 1', 'โรงอาหาร', 'หน้าประตูโรงเรียน', 'ห้องน้ำอาคาร 2', 'ห้องปฏิบัติการวิทยาศาสตร์', 'ลานจอดรถ', 'หลังอาคาร 3'];
    var incidents = [];
    for (var i = 0; i < 45; i += 1) {
      var groupIndex = rand() < 0.45 ? 0 : rand() < 0.5 ? 1 : rand() < 0.5 ? 3 : 2;
      var status = pick(rand, ['รับแจ้ง', 'กำลังดำเนินการ', 'แก้ไขแล้ว', 'แก้ไขแล้ว', 'ปิดเรื่อง', 'ปิดเรื่อง']);
      incidents.push(Object.assign({ academicYearId: yearId, incidentDate: dayAgo(0, 120), incidentTime: pad(between(rand, 7, 16), 2) + ':' + pad(between(rand, 0, 59), 2),
        category: groups[groupIndex], hazardType: pick(rand, typeByGroup[groupIndex]), severity: pick(rand, APP_CONFIG.ENTITIES['safety-incidents'].fields
          .filter(function (field) { return field.key === 'severity'; })[0].options.slice(0, rand() < 0.9 ? 2 : 4)),
        location: pick(rand, places), description: 'เหตุการณ์ตัวอย่างเพื่อทดสอบระบบ ครูเวรพบเหตุและรายงานผ่านระบบ', involved: 'นักเรียน ' + between(rand, 1, 3) + ' คน',
        initialAction: 'ครูเวรเข้าระงับเหตุ ปฐมพยาบาลเบื้องต้น และแจ้งผู้ปกครอง', status: status, responsibleId: pick(rand, leaders).id,
        resolution: /แก้ไข|ปิด/.test(status) ? 'ดำเนินการแก้ไขและติดตามผลเรียบร้อย' : '', resolvedDate: /แก้ไข|ปิด/.test(status) ? dayAgo(0, 30) : '', photoFileId: '' }, near(rand, 0.004)));
    }
    insert('SafetyIncidents', incidents);
    var risks = [];
    for (var k = 0; k < 24; k += 1) {
      var fixed = rand() < 0.5;
      risks.push(Object.assign({ academicYearId: yearId, foundDate: dayAgo(5, 120), location: pick(rand, places), category: groups[rand() < 0.8 ? 0 : 3],
        detail: pick(rand, ['พื้นลื่นเมื่อฝนตก', 'ราวบันไดชำรุด', 'สายไฟฟ้าห้อยต่ำ', 'ท่อระบายน้ำไม่มีฝาปิด', 'ต้นไม้กิ่งผุใกล้ทางเดิน', 'ถังดับเพลิงหมดอายุ']),
        riskLevel: pick(rand, ['ต่ำ', 'ปานกลาง', 'ปานกลาง', 'สูง', 'สูงมาก']), responsibleId: teacher(), dueDate: iso(addDays(today(), between(rand, -20, 30))),
        status: fixed ? 'แก้ไขแล้ว' : pick(rand, ['รอดำเนินการ', 'กำลังแก้ไข']), fixDetail: fixed ? 'ซ่อมแซมเรียบร้อยและติดป้ายเตือน' : '', fixedDate: fixed ? dayAgo(0, 20) : '',
        photoFileId: '', afterPhotoFileId: '' }, near(rand, 0.004)));
    }
    insert('SafetyRisks', risks);
    var activities = [[0, 'ซ้อมอพยพหนีไฟและภัยพิบัติ'], [0, 'ตรวจความปลอดภัยอาคารและอุปกรณ์ประจำภาคเรียน'], [0, 'อบรมความปลอดภัยทางถนนและการสวมหมวกนิรภัย'],
      [1, 'โครงการโรงเรียนปลอดการกลั่นแกล้ง (Anti-Bullying)'], [1, 'กิจกรรมเพื่อนช่วยเพื่อนไกล่เกลี่ยข้อขัดแย้ง'], [2, 'อบรมรู้เท่าทันภัยไซเบอร์'],
      [2, 'สร้างช่องทางรับแจ้งเหตุที่เป็นความลับ'], [3, 'คัดกรองสุขภาพจิตนักเรียน'], [3, 'ส่งเสริมโภชนาการและอาหารกลางวัน'], [3, 'รณรงค์ลดการติดเกม']];
    insert('SpsActivities', activities.map(function (item) {
      return { academicYearId: yearId, category: groups[item[0]], activity: item[1], objective: 'ลดความเสี่ยงและเสริมสร้างความปลอดภัยของผู้เรียน',
        target: pick(rand, ['นักเรียนทุกคน', 'ครูและบุคลากร', 'นักเรียนชั้น ป.4–ม.3']), period: pick(rand, ['ภาคเรียนที่ 1', 'ภาคเรียนที่ 2', 'ตลอดปีการศึกษา']),
        responsibleId: teacher(), budget: pick(rand, [0, 2000, 5000, 10000]), status: pick(rand, ['ยังไม่เริ่ม', 'กำลังดำเนินการ', 'เสร็จสิ้น']), result: '', fileId: '' };
    }));

    // นิเทศพร้อมคะแนนตามเกณฑ์ และ PLC
    var forms = APP_CONFIG.SUPERVISION_FORMS;
    var supervisions = [];
    for (var s = 0; s < 12; s += 1) {
      var formType = forms[s % forms.length];
      var criteria = SupervisionService.criteriaFor(formType);
      var skill = 0.6 + rand() * 0.4;
      var items = criteria.map(function (item) { return { id: item.id, sortNo: item.sortNo, item: item.item, maxScore: item.maxScore,
        score: Math.max(1, Math.min(item.maxScore, Math.round(item.maxScore * skill + (rand() - 0.5) * 1.5))) }; });
      var got = items.reduce(function (sum, item) { return sum + item.score; }, 0);
      var full = items.reduce(function (sum, item) { return sum + item.maxScore; }, 0);
      var percent = full ? Math.round(got * 1000 / full) / 10 : '';
      var committee = teachers.slice().sort(function () { return rand() - 0.5; });
      supervisions.push({ academicYearId: yearId, supervisionDate: dayAgo(3, 80), teacherId: teachers[(s * 3) % teachers.length].id, supervisorId: pick(rand, leaders).id,
        subjectName: pick(rand, SUBJECTS), score: percent, result: percent === '' ? '' : SupervisionService.levelOf(percent),
        notes: 'ควรเพิ่มการใช้คำถามกระตุ้นการคิดขั้นสูงและการวัดผลระหว่างเรียน', fileId: '', formType: formType, classLevel: pick(rand, GRADES),
        committee2Id: committee[0].id, committee3Id: committee[1].id, committee4Id: '', committee5Id: '',
        strengths: 'ครูเตรียมการสอนดี ใช้สื่อหลากหลาย นักเรียนมีส่วนร่วมในกิจกรรม', improvements: 'การบริหารเวลาในขั้นสรุปบทเรียน',
        bestPractice: pick(rand, ['การใช้เกมการศึกษาทบทวนความรู้', 'การเรียนรู้แบบร่วมมือ (Cooperative Learning)', '']),
        photo1FileId: '', photo2FileId: '', photo3FileId: '', scoresJson: JSON.stringify(items), status: 'ประเมินแล้ว' });
    }
    // คะแนนแยกรายกรรมการ: ประธาน + กรรมการ 2 คน ให้คะแนนใกล้เคียงกัน (คะแนนในรายการ = ค่าเฉลี่ย)
    var scoreRows = [];
    insert('Supervisions', supervisions).forEach(function (row) {
      var base = JSON.parse(row.scoresJson);
      [row.supervisorId, row.committee2Id, row.committee3Id].forEach(function (evaluatorId, index) {
        var own = base.map(function (item) { return { id: item.id, score: Math.max(0, Math.min(item.maxScore, item.score + (index === 0 ? 0 : Math.round((rand() - 0.5) * 1.2)))) }; });
        var got = own.reduce(function (sum, item) { return sum + item.score; }, 0);
        var full = base.reduce(function (sum, item) { return sum + item.maxScore; }, 0);
        scoreRows.push({ supervisionId: row.id, evaluatorId: evaluatorId, scoresJson: JSON.stringify(own), score: full ? Math.round(got * 1000 / full) / 10 : '',
          comment: index === 0 ? '' : pick(rand, ['นักเรียนมีส่วนร่วมดี ควรเพิ่มคำถามปลายเปิด', 'สื่อเหมาะสม ควรสรุปบทเรียนร่วมกับนักเรียน', '']),
          status: 'submitted', submittedAt: row.supervisionDate });
      });
      var average = base.map(function (item) {
        var values = scoreRows.filter(function (score) { return score.supervisionId === row.id; })
          .map(function (score) { return JSON.parse(score.scoresJson).filter(function (one) { return one.id === item.id; })[0].score; });
        return Object.assign({}, item, { score: Math.round(values.reduce(function (a, b) { return a + b; }, 0) * 100 / values.length) / 100 });
      });
      var got = average.reduce(function (sum, item) { return sum + item.score; }, 0);
      var full = average.reduce(function (sum, item) { return sum + item.maxScore; }, 0);
      var percent = Math.round(got * 1000 / full) / 10;
      SheetRepository.update('Supervisions', row.id, { scoresJson: JSON.stringify(average), score: percent, result: SupervisionService.levelOf(percent), finalizedAt: row.supervisionDate }, row.version, ACTOR);
    });
    insert('SupervisionScores', scoreRows);
    // คำขอรับการนิเทศที่ครูเพิ่งส่ง (รอมอบหมาย)
    insert('Supervisions', [0, 1, 2].map(function (index) {
      var teacher = teachers[(index * 5 + 7) % teachers.length];
      return { academicYearId: yearId, supervisionDate: '', teacherId: teacher.id, supervisorId: '', subjectName: pick(rand, SUBJECTS), score: '', result: '',
        notes: '', fileId: '', formType: forms[index % forms.length], classLevel: pick(rand, GRADES), status: 'รอมอบหมาย', batchId: 'demo-' + index,
        videoUrl: '',
        requestNote: ['สะดวกให้เข้าสังเกตคาบ 3 วันพุธ', '', 'ขอรับคำแนะนำเรื่องการจัดกิจกรรมกลุ่ม'][index], scoresJson: '' };
    }));
    var groupNames = byName('SubjectGroups');
    insert('PlcRecords', GROUP_NAMES.slice(0, 6).concat(GROUP_NAMES.slice(0, 4)).map(function (group, index) {
      return { academicYearId: yearId, meetingDate: dayAgo(index * 6, index * 6 + 5), teamName: 'PLC กลุ่มสาระ' + group, subjectGroupId: groupNames[group] || '',
        topic: pick(rand, ['การพัฒนาการอ่านจับใจความ', 'การแก้โจทย์ปัญหาคณิตศาสตร์', 'การจัดการเรียนรู้แบบ Active Learning', 'การวัดผลตามสภาพจริง']),
        members: 'ครูในกลุ่มสาระ 4 คน และผู้บริหาร 1 คน',
        problem: 'นักเรียนบางส่วนยังไม่บรรลุตัวชี้วัด', plan: 'ออกแบบกิจกรรมร่วมกันและทดลองใช้ในชั้นเรียน', result: 'ผลสัมฤทธิ์ในหน่วยการเรียนรู้ดีขึ้น',
        reflection: 'การแลกเปลี่ยนสม่ำเสมอช่วยให้ครูเห็นแนวทางใหม่', fileId: '' };
    }));

    // ประเมิน ว.23: มอบหมาย 10 คน ส่งครบ 6 คน กำลังประเมิน 2 คน ยังไม่เริ่ม 2 คน
    var director = leaders.filter(function (person) { return person.role === 'director'; })[0] || leaders[0];
    var deputy = leaders.filter(function (person) { return person.role === 'deputy'; })[0] || leaders[0];
    var evaluations = teachers.slice(0, 10).map(function (person, index) {
      var third = teachers[(index + 12) % teachers.length];
      return { academicYearId: yearId, round: 'รอบที่ 1 (1 ต.ค. – 31 มี.ค.)', teacherId: person.id, template: pick(rand, ['ครู (ยังไม่มีวิทยฐานะ)', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']),
        committee1Id: director.id, committee2Id: deputy.id, committee3Id: third.id, challengeTopic: 'การพัฒนาทักษะการอ่านคิดวิเคราะห์ของผู้เรียนด้วยกิจกรรมที่หลากหลาย',
        status: 'รอประเมิน', totalScore: '', result: '' };
    });
    var savedEvaluations = insert('PaEvaluations', evaluations);
    var scoreRows = [];
    savedEvaluations.forEach(function (evaluation, index) {
      var criteria = PaService.criteriaFor(evaluation.template);
      var roles = index < 6 ? ['self', 'c1', 'c2', 'c3'] : index < 8 ? ['self', 'c1'] : [];
      var who = { self: evaluation.teacherId, c1: evaluation.committee1Id, c2: evaluation.committee2Id, c3: evaluation.committee3Id };
      roles.forEach(function (role) {
        var scores = {};
        criteria.forEach(function (item) { scores[item.id] = rand() < 0.7 ? 4 : 3; });
        scoreRows.push({ evaluationId: evaluation.id, personnelId: who[role], role: role, scoresJson: JSON.stringify(scores),
          comment: role === 'self' ? '' : 'ปฏิบัติงานได้ตามมาตรฐานตำแหน่ง มีความตั้งใจและพัฒนาตนเองอย่างต่อเนื่อง', status: 'submitted' });
      });
    });
    insert('PaScores', scoreRows);
    savedEvaluations.forEach(function (evaluation) {
      var summary = PaService.summarize(evaluation, PaService.criteriaFor(evaluation.template), scoreRows.filter(function (row) { return row.evaluationId === evaluation.id; }));
      SheetRepository.update('PaEvaluations', evaluation.id, { status: summary.status, totalScore: summary.total, result: summary.result }, evaluation.version, ACTOR);
    });

    // SWOT: ประเด็นและผู้ตอบแบบสอบถาม
    var swotIssues = {
      'S1': [['มีโครงสร้างการบริหารงานชัดเจน', 0], ['นโยบายบางเรื่องยังไม่ต่อเนื่อง', 1]], 'S2': [['ผลสัมฤทธิ์ทางการเรียนดีขึ้นต่อเนื่อง', 0], ['การอ่านคล่องของนักเรียนชั้นต้นยังต่ำกว่าเป้า', 1]],
      'M1': [['ครูมีความรู้ตรงสาขาและทุ่มเท', 0], ['ครูบางกลุ่มสาระไม่ครบตามเกณฑ์', 1]], 'M2': [['ได้รับงบสนับสนุนจากชุมชน', 0], ['งบประมาณด้านสื่อไม่เพียงพอ', 1]],
      'M3': [['มีห้องปฏิบัติการคอมพิวเตอร์', 0], ['อาคารบางหลังชำรุด', 1]], 'M4': [['ใช้ระบบสารสนเทศในการบริหาร', 0], ['การนิเทศติดตามยังไม่สม่ำเสมอ', 1]],
      'SO': [['ชุมชนให้ความร่วมมือดี', 0], ['ปัญหาครอบครัวแตกแยกในชุมชน', 1]], 'TE': [['อินเทอร์เน็ตครอบคลุมพื้นที่', 0], ['นักเรียนติดเกมและสื่อออนไลน์', 1]],
      'EC': [['มีแหล่งเรียนรู้ทางเศรษฐกิจในชุมชน', 0], ['ผู้ปกครองมีรายได้น้อย', 1]], 'PO': [['นโยบายรัฐสนับสนุนการศึกษา', 0], ['นโยบายเปลี่ยนแปลงบ่อย', 1]]
    };
    var issueRows = [];
    APP_CONFIG.SWOT_CATEGORIES.forEach(function (category) {
      (swotIssues[category.key] || []).forEach(function (item) {
        issueRows.push({ academicYearId: yearId, category: category.name, impact: APP_CONFIG.SWOT_IMPACTS[item[1]], issue: item[0], isActive: true });
      });
    });
    var savedIssues = insert('SwotIssues', issueRows);
    // ความต้องการจำเป็น: ตามประเด็นของมาตรฐาน (มาตรฐานที่ 1 ใช้ประเด็นรอง มาตรฐานที่ 2–3 ใช้ประเด็นหลัก)
    var needRows = [];
    APP_CONFIG.QA_STANDARDS.forEach(function (standard) {
      standard.issues.forEach(function (issue) {
        (issue.subs.length ? issue.subs : [{ code: '', name: issue.name }]).forEach(function (sub) {
          needRows.push({ academicYearId: yearId, standard: standard.name, mainIssue: issue.code, subIssue: sub.code, item: sub.name, question: '', audiences: '', isActive: true });
        });
      });
    });
    var savedNeeds = insert('NeedsItems', needRows);
    // ช่องว่างที่ต้องการเน้น (PNI สูง): การอ่านเขียน คิดวิเคราะห์ ผลสัมฤทธิ์ และเทคโนโลยี
    var gap = { '1.1.1': 1.3, '1.1.2': 1.4, '1.1.5': 1.1, '2.6': 1.0, '3.4': 0.8 };
    var responses = [];
    for (var respondent = 0; respondent < 30; respondent += 1) {
      var ratings = {};
      var needAnswers = {};
      savedIssues.forEach(function (issue) {
        var good = issue.impact === APP_CONFIG.SWOT_IMPACTS[0];
        ratings[issue.id] = Math.max(1, Math.min(5, Math.round((good ? 3.8 : 2.8) + (rand() - 0.5) * 2)));
      });
      savedNeeds.forEach(function (item) {
        var shortfall = gap[item.subIssue || item.mainIssue] || 0.4;
        var desired = rand() < 0.75 ? 5 : 4;
        needAnswers[item.id] = { d: Math.max(1, Math.min(desired, Math.round(desired - shortfall - rand() * 0.9))), i: desired };
      });
      var channel = respondent < 18 ? 'internal' : 'public';
      responses.push({ academicYearId: yearId, userId: channel === 'internal' ? 'demo-respondent-' + respondent : '', channel: channel,
        deviceHash: channel === 'public' ? 'demo' + respondent : '',
        respondentType: channel === 'internal' ? pick(rand, ['ครู', 'ครู', 'บุคลากรทางการศึกษา', 'ผู้บริหาร']) : pick(rand, ['ผู้ปกครอง', 'กรรมการสถานศึกษา', 'นักเรียน', 'ชุมชน']),
        ratingsJson: JSON.stringify(ratings), needsJson: JSON.stringify(needAnswers),
        comment: respondent % 7 === 0 ? pick(rand, ['อยากให้มีกิจกรรมส่งเสริมการอ่านมากขึ้น', 'ควรเพิ่มคอมพิวเตอร์ให้นักเรียนฝึกใช้', 'ขอบคุณครูทุกท่านที่ดูแลเด็กอย่างดี']) : '' });
    }
    insert('SwotResponses', responses);
    seedStrategy(yearId, teachers, leaders, rand);

    // ลงเวลามาทำงานย้อนหลังตั้งแต่เปิดภาคเรียนถึงเมื่อวาน
    var yearRow = SheetRepository.findById('AcademicYears', yearId) || {};
    var termStart = String(yearRow.startsAt || '').slice(0, 10) || iso(addDays(today(), -60));
    var days = CheckinService.workingDays(termStart, iso(addDays(today(), -1))).slice(-160);
    var checkins = [];
    staff.forEach(function (person) {
      var punctual = rand();
      days.forEach(function (day) {
        var roll = rand();
        if (roll < 0.025) return; // ไม่ได้ลงเวลา
        if (roll < 0.05) { checkins.push({ checkDate: day, personnelId: person.id, userId: '', checkIn: '', checkOut: '', status: rand() < 0.5 ? 'ไปราชการ' : 'ลา',
          latitude: '', longitude: '', distance: '', note: 'บันทึกโดยผู้ดูแลระบบ (ตัวอย่าง)' }); return; }
        var late = rand() < (punctual < 0.2 ? 0.25 : 0.05);
        var total = 480 + (late ? between(rand, 31, 70) : between(rand, -40, 28));
        var checkIn = pad(Math.floor(total / 60), 2) + ':' + pad(total % 60, 2);
        checkins.push({ checkDate: day, personnelId: person.id, userId: '', checkIn: checkIn, checkOut: '16:' + pad(between(rand, 30, 59), 2),
          status: late ? 'มาสาย' : 'มาปกติ', latitude: '', longitude: '', distance: '', note: '' });
      });
    });
    for (var offset = 0; offset < checkins.length; offset += 500) insert('StaffCheckins', checkins.slice(offset, offset + 500));
    props().setProperty('DEMO_EXTRAS', '1');
    return true;
  };

  RUN.landing = function (state) {
    var ids = state.ids;
    var slides = [['hero0', 'อาคารเรียนและบรรยากาศของโรงเรียน'], ['hero1', 'ห้องเรียนที่เอื้อต่อการเรียนรู้'], ['hero2', 'กิจกรรมกีฬาสีสร้างความสามัคคี'], ['hero3', 'ห้องปฏิบัติการวิทยาศาสตร์'],
      ['hero4', 'ห้องสมุดส่งเสริมการอ่าน'], ['hero5', 'สวนเรียนรู้และสิ่งแวดล้อมสีเขียว']].map(function (item) { return { fileId: ids[item[0]] || '', caption: item[1] }; });
    var gallery = [['gal0', 'กิจกรรมเข้าแถวหน้าเสาธง'], ['gal1', 'ชั่วโมงศิลปะ'], ['gal2', 'ชมรมดนตรี'], ['gal3', 'โรงอาหาร'], ['gal4', 'ห้องคอมพิวเตอร์'], ['gal5', 'มุมอ่านหนังสือใต้ต้นไม้'],
      ['gal6', 'ค่ายลูกเสือ-เนตรนารี'], ['gal7', 'พิธีไหว้ครู']].map(function (item) { return { fileId: ids[item[0]] || '', caption: item[1] }; });
    var values = {
      schoolName: 'โรงเรียนตัวอย่างวิทยา', schoolNameEn: 'Sample Wittaya School', schoolCode: '1000000000', schoolAffiliation: 'สำนักงานเขตพื้นที่การศึกษาตัวอย่าง',
      schoolLevels: 'ระดับอนุบาลถึงมัธยมศึกษาตอนต้น', schoolEstablished: 'พ.ศ. 2510', schoolColors: 'น้ำเงิน-เหลืองทอง', schoolTree: 'ต้นประดู่',
      schoolAddress: '99 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 00000', schoolPhone: '000-000-0000', schoolEmail: 'info@example.com',
      directorName: 'นายสมชาย ตัวอย่างดี', academicHeadName: 'รองผู้อำนวยการฝ่ายวิชาการ (ตัวอย่าง)',
      schoolHistory: 'โรงเรียนตัวอย่างวิทยาก่อตั้งขึ้นเพื่อให้บริการการศึกษาแก่เด็กในชุมชน เริ่มเปิดสอนตั้งแต่ระดับอนุบาลและขยายโอกาสจนถึงมัธยมศึกษาตอนต้น ปัจจุบันมีนักเรียนและบุคลากรที่ร่วมกันพัฒนาโรงเรียนอย่างต่อเนื่อง (ข้อมูลตัวอย่าง)',
      directorMessage: 'ยินดีต้อนรับสู่โรงเรียนตัวอย่างวิทยา เราตั้งใจพัฒนาผู้เรียนให้เป็นคนดี มีความรู้ และมีความสุข โดยความร่วมมือของครู ผู้ปกครอง และชุมชน (ข้อมูลตัวอย่าง)',
      tickerMessages: 'เปิดรับสมัครนักเรียนใหม่ (ข้อมูลตัวอย่าง)\nขอเชิญผู้ปกครองร่วมประชุมประจำภาคเรียน',
      logoFileId: ids.logo || '', coverFileId: ids.cover || '', directorPhotoFileId: ids.director || '', heroSlides: slides, gallery: gallery
    };
    Object.keys(values).forEach(function (key) {
      var row = SheetRepository.all('Settings').filter(function (item) { return item.key === key; })[0];
      var json = JSON.stringify(values[key]);
      if (row) SheetRepository.update('Settings', row.id, { valueJson: json }, row.version, ACTOR);
      else SheetRepository.insert('Settings', { key: key, valueJson: json }, ACTOR);
    });
    SheetRepository.clearAllCaches();
    return true;
  };

  return { step: step, stepAuthed: stepAuthed, load: load, clear: clear, status: status, scheduleIfEmpty: scheduleIfEmpty, isPending: isPending,
    STAGES: STAGES, RUN: RUN, DEMO_SHEETS: DEMO_SHEETS };
})();
