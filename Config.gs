/**
 * การตั้งค่ากลางของระบบ
 * - SHEETS: โครงสร้างตารางใน Google Sheet (เพิ่มคอลัมน์ต่อท้ายได้ ระบบจะย้ายข้อมูลให้เอง)
 * - ENTITIES: โมดูลแบบตาราง/ฟอร์ม ที่หน้าเว็บสร้างหน้าจอให้อัตโนมัติ
 * - MODULES: เมนูทั้ง 36 รายการ
 */
var APP_CONFIG = (function () {
  'use strict';

  // เพิ่มเลขนี้เมื่อเปลี่ยนโครงสร้างตาราง ระบบจะอัปเดต Sheet ให้เองเมื่อเปิดเว็บครั้งถัดไป
  var SCHEMA_VERSION = 16;

  var AUDIT_COLUMNS = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'version', 'isDeleted'];
  function columns(extra) { return AUDIT_COLUMNS.concat(extra); }

  // ---------- ตารางระบบ ----------
  var SHEETS = {
    Settings: columns(['key', 'valueJson']),
    Modules: columns(['key', 'name', 'category', 'route', 'icon', 'permission', 'isEnabled', 'isAvailable']),
    Users: columns(['username', 'displayName', 'email', 'passwordHash', 'passwordSalt', 'isActive', 'mustChangePassword', 'personnelId',
      'phone', 'registrationStatus']),
    Roles: columns(['key', 'name']),
    Permissions: columns(['key', 'name']),
    UserRoles: columns(['userId', 'roleId']),
    RolePermissions: columns(['roleId', 'permissionId']),
    Sessions: columns(['userId', 'tokenHash', 'expiresAt', 'revokedAt']),
    AcademicYears: columns(['year', 'term', 'startsAt', 'endsAt', 'isActive']),
    Titles: columns(['name']),
    Positions: columns(['name']),
    PersonnelTypes: columns(['name']),
    Standings: columns(['name']),
    Divisions: columns(['name']),
    SubjectGroups: columns(['name']),
    // เช็กชื่อ: 1 แถวต่อ 1 คาบ เก็บผลของนักเรียนทั้งห้องเป็น JSON และค้นด้วย sessionKey
    AttendanceSessions: columns(['sessionKey', 'academicYearId', 'attendanceDate', 'homeroomId', 'period',
      'subjectName', 'teacherId', 'summaryJson', 'recordsJson']),
    // ปพ.5: 1 แถวต่อ 1 รายวิชา เก็บคะแนนนักเรียนทั้งห้องเป็น JSON
    GradeSheets: columns(['courseId', 'scoresJson', 'status']),
    Files: columns(['fileId', 'fileName', 'mimeType', 'ownerId', 'entity']),
    SosAlerts: columns(['message', 'location', 'status', 'acknowledgedBy', 'acknowledgedAt']),
    // ระบบภายนอกที่ผู้ดูแลระบบเพิ่มเป็นเมนู (เปิดแท็บใหม่ หรือฝังในหน้า)
    // สรุปการมาเรียนรายคน/รายภาคเรียน เก็บไว้หลังปิดปีการศึกษา (ใช้ใน ปพ.6 แทนข้อมูลรายคาบที่ย้ายไปเก็บถาวร)
    AttendanceSummaries: columns(['academicYearId', 'studentId', 'homeroomId', 'present', 'late', 'leave', 'absent']),
    // ประวัติการปิดปีการศึกษา
    YearClosures: columns(['year', 'archiveFileId', 'archiveUrl', 'summaryJson']),
    Integrations: columns(['name', 'url', 'icon', 'color', 'category', 'openMode', 'visibleRoles', 'replacesModule',
      'sortOrder', 'isEnabled', 'description']),
    // คะแนนประเมิน ว.23: 1 แถวต่อผู้ประเมิน 1 คน (ครูประเมินตนเอง หรือกรรมการ) ต่อ 1 การประเมิน
    // คะแนนนิเทศการสอน: 1 แถวต่อกรรมการ 1 คนต่อ 1 รายการนิเทศ (status: draft/submitted)
    // รายงานที่ครูส่งให้ผู้บริหารพิจารณา/ลงนาม (1 แถวต่อ 1 รายงาน ส่งซ้ำหลังแก้ไข = รอบถัดไป)
    ReportReviews: columns(['entity', 'recordId', 'title', 'submitterUserId', 'submitterPersonnelId', 'note', 'status', 'comment',
      'reviewerUserId', 'reviewerPersonnelId', 'reviewerName', 'submittedAt', 'reviewedAt', 'round', 'academicYearId']),
    SupervisionScores: columns(['supervisionId', 'evaluatorId', 'scoresJson', 'score', 'comment', 'status', 'submittedAt']),
    PaScores: columns(['evaluationId', 'personnelId', 'role', 'scoresJson', 'comment', 'status']),
    // แบบสอบถาม SWOT + ความต้องการจำเป็น: 1 แถวต่อผู้ตอบ 1 คน (ผู้ใช้ในระบบ หรือ 1 เครื่องผ่านลิงก์สาธารณะ) ต่อปีการศึกษา
    // ratingsJson = { issueId: 1–5 } · needsJson = { itemId: { d: สภาพปัจจุบัน 1–5, i: สภาพที่ควรจะเป็น 1–5 } }
    SwotResponses: columns(['academicYearId', 'userId', 'respondentType', 'ratingsJson', 'needsJson', 'channel', 'deviceHash', 'comment']),
    // แผนกลยุทธ์รายปี: การเปิดรับแบบสอบถาม และสถานะยืนยันของแต่ละขั้น (stagesJson = { tows: {at, by}, vision: … })
    StrategyPlans: columns(['academicYearId', 'surveyOpen', 'surveyUntil', 'surveyIntro', 'stagesJson']),
    // รายการของแผนกลยุทธ์ทุกขั้นในตารางเดียว level = tows | vision | mission | goal | strategy
    // parentIds = รายการขั้นก่อนหน้าที่เชื่อมถึง (คั่นด้วย ,) · sourceCodes = รหัสประเด็น SWOT/TOWS/Needs ที่อ้างอิง เช่น S1,O2
    StrategyItems: columns(['academicYearId', 'level', 'code', 'text', 'parentIds', 'sourceCodes', 'standards', 'kpi', 'target',
      'sortOrder', 'note']),
    // ลงเวลามาทำงาน: 1 แถวต่อบุคลากร 1 คนต่อวัน
    StaffCheckins: columns(['checkDate', 'personnelId', 'userId', 'checkIn', 'checkOut', 'status', 'latitude', 'longitude', 'distance', 'note']),
    // ผลสรุปสำเร็จรูป (แดชบอร์ด หน้าแรก รายการอ้างอิง ฯลฯ) ระบบเขียนเอง ใช้แทนการคำนวณจากหลายตารางเมื่อแคชว่าง
    Summaries: columns(['key', 'signature', 'part', 'parts', 'data']),
    AuditLogs: columns(['action', 'entityType', 'entityId', 'detailsJson', 'ipHint'])
  };

  // ---------- โมดูลแบบตาราง/ฟอร์ม ----------
  // field: [key, label, type, options]
  // type: text | textarea | number | date | select | ref | file | checkbox | year
  // options: r = จำเป็น, l = แสดงในตาราง, ref = ชื่อ lookup, opts = ตัวเลือก, max = ความยาว/ค่าสูงสุด
  var GRADE_LEVELS = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
  var LEVEL3 = ['ปกติ', 'เสี่ยง', 'มีปัญหา'];
  // กลุ่มภัย 4 ด้านตามโครงการโรงเรียนส่งเสริมความปลอดภัย (SPS) และประเภทภัยย่อย
  var HAZARD_GROUPS = ['ภัยจากอุบัติเหตุ (Accident)', 'ภัยจากความรุนแรง (Violence)', 'ภัยจากการละเมิดสิทธิ์ (Right)',
    'ภัยจากสุขภาวะทางกายและจิตใจ (Unhealthiness)'];
  var HAZARD_TYPES = ['ภัยธรรมชาติ', 'อาคารเรียน สิ่งก่อสร้าง', 'ยานพาหนะ/การเดินทาง', 'การจัดกิจกรรม', 'เครื่องมือ อุปกรณ์',
    'การล่วงละเมิดทางเพศ', 'การทะเลาะวิวาท', 'การกลั่นแกล้งรังแก (Bully)', 'การชุมนุมประท้วง/จลาจล', 'การก่อวินาศกรรม/ระเบิด',
    'สารเคมีและวัตถุอันตราย', 'การล่อลวง ลักพาตัว', 'การถูกปล่อยปละละเลย ทอดทิ้ง', 'การคุกคามทางเพศ', 'การไม่ได้รับความเป็นธรรม',
    'ภาวะจิตเวช/ความเครียด', 'ติดเกม', 'ยาเสพติด', 'โรคระบาด', 'ภัยไซเบอร์', 'การพนัน', 'มลภาวะเป็นพิษ', 'ภาวะทุพโภชนาการ', 'อื่น ๆ'];
  var SEVERITIES = ['น้อย (จัดการได้ทันที)', 'ปานกลาง (ต้องแจ้งครู/ผู้บริหาร)', 'รุนแรง (ต้องประสานภายนอก)', 'วิกฤต (ฉุกเฉินเร่งด่วน)'];
  // ห้องรับฟัง: เรื่องที่นักเรียนแจ้งเองผ่านหน้าสาธารณะ (ConcernService) · [หัวข้อ, ระดับความเร่งด่วนขั้นต่ำ]
  var CONCERN_TOPICS = [['เรื่องการเรียน', 0], ['เพื่อนและความสัมพันธ์', 0], ['ถูกรังแก/ถูกข่มขู่', 1], ['ครอบครัว', 0],
    ['ความรู้สึก เครียด เศร้า กังวล', 0], ['รู้สึกไม่อยากอยู่/คิดทำร้ายตัวเอง', 2], ['ถูกทำร้าย/ถูกล่วงละเมิด/ถูกคุกคาม', 1],
    ['สุขภาพกาย', 0], ['บุหรี่ ยาเสพติด เกม พนัน', 1], ['เรื่องความรัก/เรื่องเพศ', 0], ['ความปลอดภัยในโรงเรียนหรือทางออนไลน์', 0],
    ['เงิน ทุนการศึกษา อาหารกลางวัน', 0], ['เรื่องอื่น ๆ', 0]];
  var CONCERN_URGENCY = ['ปกติ', 'เร่งด่วน', 'ฉุกเฉิน'];
  var CONCERN_STATUSES = ['รอรับเรื่อง', 'รับเรื่องแล้ว', 'กำลังให้คำปรึกษา', 'ส่งต่อ', 'ปิดเรื่อง'];
  var DEV_REPORT_TYPES = ['รายงานการไปราชการ', 'รายงานการพัฒนาตนเอง'];
  var DEV_ACTIVITY_TYPES = ['ประชุม', 'อบรม/สัมมนา', 'อบรมออนไลน์', 'ศึกษาดูงาน', 'อื่น ๆ'];
  var SUPERVISION_STATUS = ['รอมอบหมาย', 'รอประเมิน', 'กำลังประเมิน', 'ประเมินแล้ว'];
  var SUPERVISION_FORMS = ['นิเทศการจัดการเรียนรู้ในชั้นเรียน', 'ตรวจแผนการจัดการเรียนรู้', 'นิเทศสภาพห้องเรียน'];
  // แบบประเมิน ว.23 ตามตำแหน่ง/วิทยฐานะ: คะแนนเต็มองค์ประกอบที่ 1 (มาตรฐานตำแหน่ง + ประเด็นท้าทาย) รวมกับองค์ประกอบ 2 และ 3 = 100
  var PA_TEMPLATES = [
    { key: 'assistant', name: 'ครูผู้ช่วย', standard: 80, challenge: 0 },
    { key: 'teacher', name: 'ครู (ยังไม่มีวิทยฐานะ)', standard: 60, challenge: 20 },
    { key: 'senior', name: 'ครูชำนาญการ', standard: 60, challenge: 20 },
    { key: 'special', name: 'ครูชำนาญการพิเศษ', standard: 60, challenge: 20 },
    { key: 'expert', name: 'ครูเชี่ยวชาญ', standard: 60, challenge: 20 }
  ];
  // [ชื่อ, กลุ่มคะแนน] กลุ่ม: standard = มาตรฐานตำแหน่ง, challenge = ประเด็นท้าทาย, c2 = องค์ประกอบที่ 2 (10), c3 = องค์ประกอบที่ 3 (10)
  var PA_COMPONENTS = [
    ['องค์ประกอบที่ 1 ด้านที่ 1 การจัดการเรียนรู้', 'standard'],
    ['องค์ประกอบที่ 1 ด้านที่ 2 การส่งเสริมและสนับสนุนการจัดการเรียนรู้', 'standard'],
    ['องค์ประกอบที่ 1 ด้านที่ 3 การพัฒนาตนเองและวิชาชีพ', 'standard'],
    ['องค์ประกอบที่ 1 ประเด็นท้าทาย', 'challenge'],
    ['องค์ประกอบที่ 2 การมีส่วนร่วมในการพัฒนาการศึกษา', 'c2'],
    ['องค์ประกอบที่ 3 วินัย คุณธรรม จริยธรรม และจรรยาบรรณวิชาชีพ', 'c3']
  ].map(function (item) { return { name: item[0], group: item[1] }; });
  var PA_ROUNDS = ['รอบที่ 1 (1 ต.ค. – 31 มี.ค.)', 'รอบที่ 2 (1 เม.ย. – 30 ก.ย.)'];
  // ปัจจัยวิเคราะห์ SWOT: ภายใน 2S4M (จุดแข็ง/จุดอ่อน) และภายนอก PEST (โอกาส/อุปสรรค) พร้อมน้ำหนักของแต่ละด้าน
  var SWOT_CATEGORIES = [
    ['S1', 'ด้านโครงสร้างและนโยบาย (Structure)', 'internal', 0.16], ['S2', 'ด้านผลผลิตและการบริการ (Service)', 'internal', 0.16],
    ['M1', 'ด้านบุคลากร (Man)', 'internal', 0.20], ['M2', 'ด้านการเงิน (Money)', 'internal', 0.12],
    ['M3', 'ด้านวัสดุ อุปกรณ์ (Materials)', 'internal', 0.16], ['M4', 'ด้านการบริหารจัดการ (Management)', 'internal', 0.20],
    ['SO', 'ด้านสังคม-วัฒนธรรม (Social)', 'external', 0.35], ['TE', 'ด้านเทคโนโลยี (Technology)', 'external', 0.25],
    ['EC', 'ด้านเศรษฐกิจ (Economic)', 'external', 0.30], ['PO', 'ด้านการเมืองและกฎหมาย (Politics)', 'external', 0.10]
  ].map(function (item) { return { key: item[0], name: item[1], env: item[2], weight: item[3] }; });
  var SWOT_IMPACTS = ['เชิงบวก (จุดแข็ง/โอกาส)', 'เชิงลบ (จุดอ่อน/อุปสรรค)'];
  // กลุ่มผู้ตอบแบบสอบถาม SWOT (ภายใน = ตอบในระบบได้ · ทุกกลุ่มตอบผ่านลิงก์สาธารณะได้)
  var SWOT_RESPONDENTS = ['ผู้บริหาร', 'ครู', 'บุคลากรทางการศึกษา', 'กรรมการสถานศึกษา', 'ผู้ปกครอง', 'นักเรียน', 'ชุมชน'];
  // มาตรฐานการศึกษาระดับการศึกษาขั้นพื้นฐาน (ประกาศกระทรวงศึกษาธิการ พ.ศ. 2561)
  // มาตรฐาน → ประเด็นหลัก (ประเด็นพิจารณา เช่น 1.1) → ประเด็นรอง (ข้อย่อย เช่น 1.1.1) · มาตรฐานที่ 2 และ 3 ไม่มีประเด็นรอง
  var QA_STANDARDS = [
    ['มาตรฐานที่ 1 คุณภาพของผู้เรียน', [
      ['1.1', 'ผลสัมฤทธิ์ทางวิชาการของผู้เรียน', ['มีความสามารถในการอ่าน การเขียน การสื่อสาร และการคิดคำนวณ',
        'มีความสามารถในการคิดวิเคราะห์ คิดอย่างมีวิจารณญาณ อภิปรายแลกเปลี่ยนความคิดเห็น และแก้ปัญหา', 'มีความสามารถในการสร้างนวัตกรรม',
        'มีความสามารถในการใช้เทคโนโลยีสารสนเทศและการสื่อสาร', 'มีผลสัมฤทธิ์ทางการเรียนตามหลักสูตรสถานศึกษา',
        'มีความรู้ ทักษะพื้นฐาน และเจตคติที่ดีต่องานอาชีพ']],
      ['1.2', 'คุณลักษณะที่พึงประสงค์ของผู้เรียน', ['การมีคุณลักษณะและค่านิยมที่ดีตามที่สถานศึกษากำหนด', 'ความภูมิใจในท้องถิ่นและความเป็นไทย',
        'การยอมรับที่จะอยู่ร่วมกันบนความแตกต่างและหลากหลาย', 'สุขภาวะทางร่างกาย และจิตสังคม']]]],
    ['มาตรฐานที่ 2 กระบวนการบริหารและการจัดการ', [
      ['2.1', 'มีเป้าหมาย วิสัยทัศน์ และพันธกิจที่สถานศึกษากำหนดชัดเจน', []], ['2.2', 'มีระบบบริหารจัดการคุณภาพของสถานศึกษา', []],
      ['2.3', 'ดำเนินงานพัฒนาวิชาการที่เน้นคุณภาพผู้เรียนรอบด้านตามหลักสูตรสถานศึกษาและทุกกลุ่มเป้าหมาย', []],
      ['2.4', 'พัฒนาครูและบุคลากรให้มีความเชี่ยวชาญทางวิชาชีพ', []],
      ['2.5', 'จัดสภาพแวดล้อมทางกายภาพและสังคมที่เอื้อต่อการจัดการเรียนรู้อย่างมีคุณภาพ', []],
      ['2.6', 'จัดระบบเทคโนโลยีสารสนเทศเพื่อสนับสนุนการบริหารจัดการและการจัดการเรียนรู้', []]]],
    ['มาตรฐานที่ 3 กระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ', [
      ['3.1', 'จัดการเรียนรู้ผ่านกระบวนการคิดและปฏิบัติจริง และสามารถนำไปประยุกต์ใช้ในชีวิตได้', []],
      ['3.2', 'ใช้สื่อ เทคโนโลยีสารสนเทศ และแหล่งเรียนรู้ที่เอื้อต่อการเรียนรู้', []], ['3.3', 'มีการบริหารจัดการชั้นเรียนเชิงบวก', []],
      ['3.4', 'ตรวจสอบและประเมินผู้เรียนอย่างเป็นระบบ และนำผลมาพัฒนาผู้เรียน', []],
      ['3.5', 'มีการแลกเปลี่ยนเรียนรู้และให้ข้อมูลสะท้อนกลับเพื่อพัฒนาและปรับปรุงการจัดการเรียนรู้', []]]]
  ].map(function (standard, index) {
    return { key: String(index + 1), name: standard[0], issues: standard[1].map(function (issue) {
      return { code: issue[0], name: issue[1], subs: issue[2].map(function (sub, subIndex) { return { code: issue[0] + '.' + (subIndex + 1), name: sub }; }) };
    }) };
  });
  var QA_STANDARD_NAMES = QA_STANDARDS.map(function (standard) { return standard.name; });
  var PROJECT_STATUSES = ['เสนอโครงการ', 'อนุมัติ', 'กำลังดำเนินการ', 'เสร็จสิ้น', 'ยกเลิก'];
  var PROJECT_DEPARTMENTS = ['บริหารงานวิชาการ', 'บริหารงานงบประมาณ', 'บริหารงานบุคคล', 'บริหารงานทั่วไป'];
  var PROJECT_BUDGET_SOURCES = ['เงินอุดหนุนรายหัว', 'เงินอุดหนุนเรียนฟรี 15 ปี', 'เงินรายได้สถานศึกษา', 'เงินบริจาค/ภาคีเครือข่าย', 'ไม่ใช้งบประมาณ', 'อื่น ๆ'];
  var TARGET_STATUSES = ['บรรลุ', 'บรรลุบางส่วน', 'ไม่บรรลุ'];
  var ENTITIES = {
    'announcements': { sheet: 'Announcements', label: 'ประกาศ', module: 'announcements', folder: 'policies',
      order: '-publishDate', fields: [
        ['title', 'หัวข้อ', 'text', { r: 1, l: 1, max: 200 }],
        ['publishDate', 'วันที่ประกาศ', 'date', { r: 1, l: 1 }],
        ['isPinned', 'ปักหมุด', 'checkbox', { l: 1 }],
        ['body', 'รายละเอียด', 'textarea', { max: 5000 }],
        ['isPublic', 'แสดงบนหน้าแรก (ทุกคนเห็น)', 'checkbox', { l: 1 }],
        ['fileId', 'ไฟล์แนบ', 'file', {}]
      ] },
    'calendar': { sheet: 'CalendarEvents', label: 'ปฏิทินโรงเรียน', module: 'calendar', yearScoped: true,
      order: 'eventDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['eventDate', 'วันที่', 'date', { r: 1, l: 1 }],
        ['endDate', 'ถึงวันที่', 'date', { l: 1 }],
        ['name', 'กิจกรรม', 'text', { r: 1, l: 1, max: 200 }],
        ['blocksAttendance', 'วันหยุด (ไม่เช็กชื่อ)', 'checkbox', { l: 1 }]
      ] },
    'personnel': { sheet: 'Personnel', label: 'ทะเบียนบุคลากร', module: 'personnel', folder: 'personnel',
      order: 'personnelCode', fields: [
        ['personnelCode', 'รหัสบุคลากร', 'text', { r: 1, l: 1, max: 30 }],
        ['titleId', 'คำนำหน้า', 'ref', { ref: 'titles', l: 1 }],
        ['firstName', 'ชื่อ', 'text', { r: 1, l: 1, max: 100 }],
        ['lastName', 'นามสกุล', 'text', { r: 1, l: 1, max: 100 }],
        ['personnelTypeId', 'ประเภทบุคลากร', 'ref', { ref: 'personnelTypes', l: 1 }],
        ['positionId', 'ตำแหน่ง', 'ref', { ref: 'positions', l: 1 }],
        ['standingId', 'วิทยฐานะ', 'ref', { ref: 'standings' }],
        ['divisionId', 'ฝ่าย', 'ref', { ref: 'divisions' }],
        ['subjectGroupId', 'กลุ่มสาระฯ', 'ref', { ref: 'subjectGroups' }],
        ['phone', 'โทรศัพท์', 'text', { l: 1, max: 30 }],
        ['email', 'อีเมล', 'text', { max: 120 }],
        ['startDate', 'วันที่เริ่มปฏิบัติงาน', 'date', {}],
        ['photoFileId', 'รูปถ่าย', 'file', {}]
      ] },
    'personnel-years': { sheet: 'PersonnelYears', label: 'ข้อมูลบุคลากรรายปี', module: 'personnel-years', yearScoped: true,
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1, l: 1 }],
        ['personnelId', 'บุคลากร', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['positionId', 'ตำแหน่ง', 'ref', { ref: 'positions', l: 1 }],
        ['divisionId', 'ฝ่าย', 'ref', { ref: 'divisions', l: 1 }],
        ['standingId', 'วิทยฐานะ', 'ref', { ref: 'standings' }],
        ['duty', 'หน้าที่พิเศษ', 'text', { l: 1, max: 200 }],
        ['status', 'สถานะ', 'select', { opts: ['ปฏิบัติงาน', 'ลาศึกษาต่อ', 'ย้าย', 'เกษียณ'], l: 1 }]
      ] },
    'teaching-load': { sheet: 'TeachingLoads', label: 'ภาระงานสอน', module: 'teaching-load', yearScoped: true,
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['personnelId', 'ครูผู้สอน', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['subjectGroupId', 'กลุ่มสาระฯ', 'ref', { ref: 'subjectGroups', l: 1 }],
        ['subjectName', 'รายวิชา', 'text', { r: 1, l: 1, max: 150 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', l: 1 }],
        ['hoursPerWeek', 'ชั่วโมง/สัปดาห์', 'number', { r: 1, l: 1, max: 60 }]
      ] },
    'supervision': { sheet: 'Supervisions', label: 'นิเทศการสอน', module: 'supervision', yearScoped: true, folder: 'supervision',
      order: '-supervisionDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['supervisionDate', 'วันที่นิเทศ', 'date', { l: 1 }],
        ['teacherId', 'ครูผู้รับการนิเทศ', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['supervisorId', 'ผู้นิเทศ (ประธาน)', 'ref', { ref: 'personnel', l: 1 }],
        ['subjectName', 'รายวิชา', 'text', { l: 1, max: 150 }],
        ['score', 'คะแนน (เต็ม 100)', 'number', { l: 1, max: 100 }],
        ['result', 'ผลการนิเทศ', 'select', { opts: ['ดีเยี่ยม', 'ดีมาก', 'ดี', 'พอใช้', 'ปรับปรุง'], l: 1 }],
        ['notes', 'ข้อเสนอแนะ', 'textarea', { max: 3000 }],
        ['fileId', 'แผนการจัดการเรียนรู้/หลักฐาน', 'file', {}],
        ['formType', 'แบบนิเทศ', 'select', { opts: SUPERVISION_FORMS, l: 1, filter: 1 }],
        ['classLevel', 'ระดับชั้น', 'select', { opts: GRADE_LEVELS }],
        ['committee2Id', 'กรรมการคนที่ 2', 'ref', { ref: 'personnel' }],
        ['committee3Id', 'กรรมการคนที่ 3', 'ref', { ref: 'personnel' }],
        ['committee4Id', 'กรรมการคนที่ 4', 'ref', { ref: 'personnel' }],
        ['committee5Id', 'กรรมการคนที่ 5', 'ref', { ref: 'personnel' }],
        ['strengths', 'จุดเด่น', 'textarea', { max: 3000 }],
        ['improvements', 'จุดที่ควรพัฒนา', 'textarea', { max: 3000 }],
        ['bestPractice', 'วิธีปฏิบัติที่ดี (Best Practice)', 'textarea', { max: 3000 }],
        ['photo1FileId', 'ภาพประกอบ 1', 'file', { accept: 'image/*' }],
        ['photo2FileId', 'ภาพประกอบ 2', 'file', { accept: 'image/*' }],
        ['photo3FileId', 'ภาพประกอบ 3', 'file', { accept: 'image/*' }],
        ['scoresJson', 'คะแนนรายข้อ', 'text', { hide: 1 }],
        // ครูส่งขอรับการนิเทศเอง → มอบหมาย → กรรมการให้คะแนนแยกคน (SupervisionScores) → ประธานสรุปผล
        ['status', 'สถานะ', 'select', { opts: SUPERVISION_STATUS, l: 1, filter: 1 }],
        ['videoUrl', 'ลิงก์วีดีโอการสอน', 'text', { max: 500 }],
        ['requestNote', 'ข้อความจากครู', 'textarea', { max: 1000 }],
        ['batchId', 'ชุดการส่ง', 'text', { hide: 1, sys: 1 }],
        ['aiAdvice', 'ความเห็นเพื่อการพัฒนาครู', 'textarea', { max: 6000 }],
        ['finalizedAt', 'วันที่สรุปผล', 'text', { hide: 1, sys: 1 }]
      ] },
    'students': { sheet: 'Students', label: 'ทะเบียนนักเรียน', module: 'students', folder: 'students',
      order: 'studentCode', fields: [
        ['studentCode', 'เลขประจำตัว', 'text', { r: 1, l: 1, max: 20 }],
        ['titleId', 'คำนำหน้า', 'ref', { ref: 'titles', l: 1 }],
        ['firstName', 'ชื่อ', 'text', { r: 1, l: 1, max: 100 }],
        ['lastName', 'นามสกุล', 'text', { r: 1, l: 1, max: 100 }],
        ['gender', 'เพศ', 'select', { opts: ['ชาย', 'หญิง'], l: 1 }],
        ['birthDate', 'วันเกิด', 'date', {}],
        ['nationalId', 'เลขประจำตัวประชาชน', 'text', { max: 13 }],
        ['guardianName', 'ผู้ปกครอง', 'text', { max: 150 }],
        ['guardianPhone', 'โทรศัพท์ผู้ปกครอง', 'text', { l: 1, max: 30 }],
        ['address', 'ที่อยู่', 'textarea', { max: 500 }],
        ['status', 'สถานะ', 'select', { opts: ['กำลังศึกษา', 'จบการศึกษา', 'ย้ายออก', 'ลาออก'], l: 1 }],
        ['photoFileId', 'รูปถ่าย', 'file', {}]
      ] },
    'student-enrollments': { sheet: 'StudentEnrollments', label: 'ทะเบียนนักเรียนรายปี', module: 'student-enrollments',
      yearScoped: true, order: 'number', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', r: 1, l: 1, filter: 1 }],
        ['number', 'เลขที่', 'number', { r: 1, l: 1, max: 99 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['status', 'สถานะ', 'select', { opts: ['กำลังศึกษา', 'ย้ายออก', 'พักการเรียน'], l: 1 }]
      ] },
    'homerooms': { sheet: 'Homerooms', label: 'ห้องเรียนและครูที่ปรึกษา', module: 'homerooms', yearScoped: true,
      order: 'roomName', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['gradeLevel', 'ระดับชั้น', 'select', { opts: GRADE_LEVELS, r: 1, l: 1 }],
        ['roomName', 'ชื่อห้อง', 'text', { r: 1, l: 1, max: 30 }],
        ['advisorId', 'ครูที่ปรึกษา', 'ref', { ref: 'personnel', l: 1 }],
        ['coAdvisorId', 'ครูที่ปรึกษาร่วม', 'ref', { ref: 'personnel', l: 1 }]
      ] },
    'student-information': { sheet: 'StudentInformation', label: 'สารสนเทศรายบุคคล', module: 'student-information',
      yearScoped: true, fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['weight', 'น้ำหนัก (กก.)', 'number', { l: 1, max: 200 }],
        ['height', 'ส่วนสูง (ซม.)', 'number', { l: 1, max: 250 }],
        ['bloodType', 'หมู่เลือด', 'select', { opts: ['A', 'B', 'AB', 'O'], l: 1 }],
        ['disease', 'โรคประจำตัว/แพ้ยา', 'text', { l: 1, max: 300 }],
        ['talent', 'ความสามารถพิเศษ', 'text', { max: 300 }],
        ['notes', 'หมายเหตุ', 'textarea', { max: 2000 }]
      ] },
    'home-visits': { sheet: 'HomeVisits', label: 'เยี่ยมบ้าน', module: 'home-visits', yearScoped: true, folder: 'home-visits',
      order: '-visitDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['visitDate', 'วันที่เยี่ยม', 'date', { r: 1, l: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['visitorId', 'ผู้เยี่ยม', 'ref', { ref: 'personnel', l: 1 }],
        ['livingWith', 'อาศัยอยู่กับ', 'select', { opts: ['บิดามารดา', 'บิดา', 'มารดา', 'ญาติ', 'อื่น ๆ'], l: 1 }],
        ['economicStatus', 'ฐานะทางเศรษฐกิจ', 'select', { opts: ['พอเพียง', 'ขาดแคลน', 'ยากจน'], l: 1 }],
        ['findings', 'ความเห็น/ข้อเสนอแนะของครูผู้เยี่ยม', 'textarea', { max: 3000 }],
        ['photoFileId', 'รูปถ่ายการเยี่ยม', 'file', { accept: 'image/*' }],
        ['informant', 'ผู้ให้ข้อมูล', 'text', { max: 150 }],
        ['distanceKm', 'ระยะทางบ้าน–โรงเรียน (กม.)', 'number', { max: 500 }],
        ['travelMinutes', 'เวลาเดินทาง (นาที)', 'number', { max: 600 }],
        ['transport', 'การเดินทางมาโรงเรียน', 'select', { opts: ['เดิน', 'จักรยาน', 'รถจักรยานยนต์', 'รถรับส่งนักเรียน', 'ผู้ปกครองมาส่ง', 'รถโดยสารประจำทาง'] }],
        ['housingType', 'ประเภทที่พัก', 'select', { opts: ['บ้านตนเอง', 'บ้านเช่า', 'ที่พักหน่วยงาน', 'อาศัยญาติ', 'หอพัก/ห้องเช่า'] }],
        ['houseCondition', 'สภาพบ้าน', 'select', { opts: ['มั่นคงถาวร/ปลอดภัย', 'ทรุดโทรม/ต้องซ่อมแซม', 'สะอาดเป็นระเบียบ', 'ไม่เป็นระเบียบ'] }],
        ['familyRelation', 'ความสัมพันธ์ในครอบครัว', 'select', { opts: ['อบอุ่น/เข้าใจกันดี', 'ขัดแย้งบ้าง/ห่างเหิน', 'มีความรุนแรงในครอบครัว'], l: 1 }],
        ['debt', 'ภาระหนี้สินของครอบครัว', 'select', { opts: ['ไม่มีหนี้สิน', 'มีหนี้สินแต่พอชำระได้', 'มีหนี้สินและเดือดร้อนมาก'] }],
        ['community', 'สภาพแวดล้อมชุมชน/ความปลอดภัยรอบบ้าน', 'textarea', { max: 2000 }],
        ['homeBehavior', 'พฤติกรรมเมื่ออยู่บ้าน/การช่วยงานบ้าน/การใช้สื่อ', 'textarea', { max: 2000 }],
        ['parentConcern', 'ความเป็นห่วงหรือความต้องการของผู้ปกครอง', 'textarea', { max: 2000 }],
        ['latitude', 'ละติจูดบ้าน', 'text', { max: 20, geo: 'lat' }],
        ['longitude', 'ลองจิจูดบ้าน', 'text', { max: 20, geo: 'lng' }]
      ] },
    'student-support': { sheet: 'SupportCases', label: 'ระบบดูแลช่วยเหลือ', module: 'student-support', yearScoped: true,
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['group', 'กลุ่ม', 'select', { opts: ['ปกติ', 'เสี่ยง', 'มีปัญหา'], r: 1, l: 1 }],
        ['issue', 'ด้านที่พบ', 'select', { opts: ['การเรียน', 'สุขภาพ', 'ครอบครัว', 'พฤติกรรม', 'เศรษฐกิจ', 'อื่น ๆ'], l: 1 }],
        ['action', 'การช่วยเหลือ', 'textarea', { max: 3000 }],
        ['status', 'สถานะ', 'select', { opts: ['กำลังดำเนินการ', 'ติดตามผล', 'ส่งต่อ', 'ยุติ'], l: 1 }],
        ['advisorId', 'ครูผู้รับผิดชอบ', 'ref', { ref: 'personnel', l: 1 }]
      ] },
    'sdq': { sheet: 'SdqAssessments', label: 'แบบประเมิน SDQ', module: 'sdq', yearScoped: true, fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['assessor', 'ผู้ประเมิน', 'select', { opts: ['ครู', 'ผู้ปกครอง', 'นักเรียน'], r: 1, l: 1 }],
        ['emotional', 'ด้านอารมณ์ (0-10)', 'number', { r: 1, max: 10 }],
        ['conduct', 'ด้านความประพฤติ (0-10)', 'number', { r: 1, max: 10 }],
        ['hyperactivity', 'ด้านสมาธิสั้น (0-10)', 'number', { r: 1, max: 10 }],
        ['peer', 'ด้านเพื่อน (0-10)', 'number', { r: 1, max: 10 }],
        ['prosocial', 'ด้านสัมพันธภาพทางสังคม (0-10)', 'number', { r: 1, max: 10 }],
        ['totalScore', 'คะแนนรวมปัญหา', 'number', { l: 1, computed: 1 }],
        ['result', 'ผลการประเมิน', 'text', { l: 1, computed: 1 }]
      ] },
    'scholarships': { sheet: 'Scholarships', label: 'ทุนการศึกษา', module: 'scholarships', yearScoped: true, fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['name', 'ชื่อทุน', 'text', { r: 1, l: 1, max: 200 }],
        ['source', 'แหล่งทุน', 'text', { l: 1, max: 200 }],
        ['amount', 'จำนวนเงิน (บาท)', 'number', { r: 1, l: 1, max: 10000000 }],
        ['receivedDate', 'วันที่ได้รับ', 'date', { l: 1 }]
      ] },
    'timetable': { sheet: 'TimetableEntries', label: 'ตารางสอน', module: 'timetable', yearScoped: true,
      order: 'weekday,period', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', r: 1, l: 1, filter: 1 }],
        ['weekday', 'วัน', 'select', { opts: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'], r: 1, l: 1 }],
        ['period', 'คาบที่', 'number', { r: 1, l: 1, max: 12 }],
        ['subjectName', 'รายวิชา', 'text', { r: 1, l: 1, max: 150 }],
        ['subjectGroupId', 'กลุ่มสาระฯ', 'ref', { ref: 'subjectGroups' }],
        ['teacherId', 'ครูผู้สอน', 'ref', { ref: 'personnel', l: 1, filter: 1 }]
      ] },
    // ===== การลาและไปราชการของบุคลากร =====
    'leave-requests': { sheet: 'LeaveRequests', label: 'การลาและไปราชการ', module: 'leave-requests', yearScoped: true, folder: 'personnel', order: '-fromDate',
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['personnelId', 'ผู้ขอ', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['leaveType', 'ประเภท', 'select', { opts: ['ลาป่วย', 'ลากิจส่วนตัว', 'ลาพักผ่อน', 'ลาคลอดบุตร', 'ไปราชการ/อบรม', 'อื่น ๆ'], r: 1, l: 1, filter: 1 }],
        ['fromDate', 'ตั้งแต่วันที่', 'date', { r: 1, l: 1 }],
        ['toDate', 'ถึงวันที่', 'date', { r: 1, l: 1 }],
        ['days', 'จำนวนวันทำการ', 'number', { l: 1, computed: 1 }],
        ['reason', 'เหตุผล/รายละเอียด', 'textarea', { r: 1, max: 1000 }],
        ['contact', 'ระหว่างลาติดต่อได้ที่', 'text', { max: 200 }],
        ['fileId', 'เอกสารแนบ (ใบรับรองแพทย์/หนังสือเชิญ)', 'file', {}],
        ['formFileId', 'ใบลา (PDF)', 'file', { sys: 1 }],
        ['status', 'สถานะ', 'select', { opts: ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ'], r: 1, l: 1, filter: 1, def: 'รออนุมัติ' }],
        ['approverNote', 'ความเห็นผู้อนุมัติ', 'textarea', { max: 1000 }],
        ['approvedBy', 'ผู้อนุมัติ', 'text', { computed: 1 }]
      ] },
    // รายงานการไปราชการ / การพัฒนาตนเอง (ประชุม อบรม ศึกษาดูงาน): ครูรายงานของตนเอง รูป 2 ใบ + ไฟล์รายงาน แล้วกด "ส่งผู้บริหาร" เพื่อลงนาม
    'dev-reports': { sheet: 'DevReports', label: 'รายงานไปราชการ/พัฒนาตนเอง', module: 'dev-reports', yearScoped: true, folder: 'personnel', order: '-fromDate',
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['personnelId', 'ผู้รายงาน', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['reportType', 'ประเภทรายงาน', 'select', { opts: DEV_REPORT_TYPES, r: 1, l: 1, filter: 1 }],
        ['activityType', 'ลักษณะกิจกรรม', 'select', { opts: DEV_ACTIVITY_TYPES, l: 1 }],
        ['title', 'เรื่อง', 'text', { r: 1, l: 1, max: 300 }],
        ['organizer', 'หน่วยงานผู้จัด', 'text', { max: 200 }],
        ['location', 'สถานที่', 'text', { max: 200 }],
        ['fromDate', 'ตั้งแต่วันที่', 'date', { r: 1, l: 1 }],
        ['toDate', 'ถึงวันที่', 'date', {}],
        ['hours', 'จำนวนชั่วโมง', 'number', { max: 999 }],
        ['orderRef', 'ตามหนังสือ/คำสั่งที่ (ถ้ามี)', 'text', { max: 200 }],
        ['summary', 'สาระสำคัญ/ความรู้ที่ได้รับ', 'textarea', { r: 1, max: 4000 }],
        ['application', 'การนำไปใช้/ขยายผล', 'textarea', { max: 3000 }],
        ['paIndicator', 'สอดคล้องกับตัวชี้วัด/มาตรฐานตำแหน่ง (PA)', 'text', { max: 300 }],
        ['photo1FileId', 'รูปภาพ 1', 'file', { accept: 'image/*' }],
        ['photo2FileId', 'รูปภาพ 2', 'file', { accept: 'image/*' }],
        ['fileId', 'ไฟล์รายงาน/เกียรติบัตร', 'file', {}]
      ] },
    'lesson-plans': { sheet: 'LessonPlans', label: 'แผนการสอน', module: 'lesson-plans', yearScoped: true, folder: 'lesson-plans',
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['teacherId', 'ครูผู้สอน', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['subjectName', 'รายวิชา', 'text', { r: 1, l: 1, max: 150 }],
        ['gradeLevel', 'ระดับชั้น', 'select', { opts: GRADE_LEVELS, l: 1 }],
        ['unit', 'หน่วยการเรียนรู้', 'text', { l: 1, max: 200 }],
        ['title', 'ชื่อแผน', 'text', { r: 1, l: 1, max: 200 }],
        ['fileId', 'ไฟล์แผนการสอน', 'file', {}],
        ['postTeachingNote', 'บันทึกหลังสอน', 'textarea', { max: 3000 }]
      ] },
    // บันทึกหลังการสอนรายคาบ: ครูบันทึกผลและปัญหา แล้วให้น้องวิชาการวิเคราะห์แนวทาง Active Learning และการปรับแผน
    'teaching-logs': { sheet: 'TeachingLogs', label: 'บันทึกหลังการสอน', module: 'teaching-logs', yearScoped: true, folder: 'lesson-plans',
      order: '-teachDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['teachDate', 'วันที่สอน', 'date', { r: 1, l: 1 }],
        ['teacherId', 'ครูผู้สอน', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['subjectName', 'รายวิชา', 'text', { r: 1, l: 1, max: 150 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', l: 1, filter: 1 }],
        ['period', 'คาบที่', 'text', { max: 20 }],
        ['topic', 'เรื่อง/หน่วยการเรียนรู้', 'text', { r: 1, l: 1, max: 300 }],
        ['teachingMethod', 'วิธีสอน/กิจกรรมที่ใช้ในคาบนี้', 'textarea', { max: 2000 }],
        ['resultK', 'ผลด้านความรู้ (K)', 'textarea', { max: 2000 }],
        ['resultP', 'ผลด้านทักษะกระบวนการ (P)', 'textarea', { max: 2000 }],
        ['resultA', 'ผลด้านเจตคติ/คุณลักษณะ (A)', 'textarea', { max: 2000 }],
        ['studentsTotal', 'นักเรียนทั้งหมด (คน)', 'number', { max: 100 }],
        ['studentsPassed', 'ผ่านจุดประสงค์ (คน)', 'number', { max: 100 }],
        ['problems', 'ปัญหา/อุปสรรคที่พบ', 'textarea', { max: 3000 }],
        ['aiAnalysis', 'ผลวิเคราะห์และแนวทางแก้ไข (น้องวิชาการ)', 'textarea', { max: 12000 }],
        ['nextSteps', 'แนวทางที่ครูเลือกนำไปใช้', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์/ภาพประกอบ', 'file', {}]
      ] },
    // บันทึกโฮมรูมรายวัน: 1 ห้องต่อ 1 วัน (หน้าจอเฉพาะที่เมนู "บันทึกโฮมรูม")
    'homeroom-logs': { sheet: 'HomeroomLogs', label: 'บันทึกโฮมรูม', module: 'homeroom-logs', yearScoped: true, folder: 'care',
      order: '-logDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['logDate', 'วันที่', 'date', { r: 1, l: 1 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', r: 1, l: 1, filter: 1 }],
        ['teacherId', 'ครูผู้บันทึก', 'ref', { ref: 'personnel', l: 1 }],
        ['present', 'มา (คน)', 'number', { l: 1, max: 200 }],
        ['late', 'สาย (คน)', 'number', { l: 1, max: 200 }],
        ['leave', 'ลา (คน)', 'number', { l: 1, max: 200 }],
        ['absent', 'ขาด (คน)', 'number', { l: 1, max: 200 }],
        ['topics', 'กิจกรรม/หัวข้อโฮมรูม', 'textarea', { r: 1, l: 1, max: 2000 }],
        ['studentIssues', 'เรื่องที่นักเรียนแจ้ง/ปัญหาที่พบ', 'textarea', { max: 3000 }],
        ['followStudentIds', 'นักเรียนที่ต้องติดตาม', 'text', { multi: 'students', max: 4000 }],
        ['followNote', 'การดำเนินการ/การส่งต่อ', 'textarea', { max: 3000 }],
        ['photoFileId', 'ภาพกิจกรรม', 'file', { accept: 'image/*' }]
      ] },
    'porpor5': { sheet: 'Courses', label: 'ปพ.5 บันทึกผลการเรียน', module: 'porpor5', yearScoped: true,
      order: 'subjectCode', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['subjectCode', 'รหัสวิชา', 'text', { r: 1, l: 1, max: 20 }],
        ['subjectName', 'ชื่อวิชา', 'text', { r: 1, l: 1, max: 150 }],
        ['subjectGroupId', 'กลุ่มสาระฯ', 'ref', { ref: 'subjectGroups' }],
        ['subjectType', 'ประเภท', 'select', { opts: ['พื้นฐาน', 'เพิ่มเติม', 'กิจกรรม'], l: 1 }],
        ['credit', 'หน่วยกิต/ชั่วโมง', 'number', { r: 1, l: 1, max: 20 }],
        ['homeroomId', 'ห้องเรียน', 'ref', { ref: 'homerooms', r: 1, l: 1, filter: 1 }],
        ['teacherId', 'ครูผู้สอน', 'ref', { ref: 'personnel', l: 1, filter: 1 }],
        ['collectedMax', 'คะแนนเก็บเต็ม', 'number', { r: 1, max: 100, def: 70 }],
        ['examMax', 'คะแนนสอบเต็ม', 'number', { r: 1, max: 100, def: 30 }]
      ] },
    'awards': { sheet: 'Awards', label: 'ผลงานและรางวัล', module: 'awards', yearScoped: true, folder: 'awards',
      order: '-awardDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['ownerType', 'ประเภทผลงาน', 'select', { opts: ['ครู', 'นักเรียน', 'โรงเรียน'], r: 1, l: 1, filter: 1 }],
        ['personnelId', 'ครู', 'ref', { ref: 'personnel', l: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', l: 1 }],
        ['title', 'ชื่อผลงาน/รางวัล', 'text', { r: 1, l: 1, max: 300 }],
        ['level', 'ระดับ', 'select', { opts: ['โรงเรียน', 'เขตพื้นที่', 'จังหวัด', 'ภาค', 'ประเทศ', 'นานาชาติ'], l: 1 }],
        ['rank', 'ผลที่ได้', 'text', { l: 1, max: 100 }],
        ['awardDate', 'วันที่', 'date', { l: 1 }],
        ['organizer', 'หน่วยงานที่มอบ', 'text', { max: 200 }],
        ['fileId', 'หลักฐาน', 'file', {}]
      ] },
    'sar': { sheet: 'SarSections', label: 'รายงาน SAR', module: 'sar', yearScoped: true, folder: 'quality',
      order: 'sectionNo', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['sectionNo', 'ลำดับ', 'number', { r: 1, l: 1, max: 99 }],
        ['title', 'หัวข้อ', 'text', { r: 1, l: 1, max: 200 }],
        ['content', 'เนื้อหา', 'textarea', { max: 20000 }],
        ['fileId', 'ไฟล์ประกอบ', 'file', {}]
      ] },
    'quality-assurance': { sheet: 'QaIndicators', label: 'ประกันคุณภาพ', module: 'quality-assurance', yearScoped: true,
      folder: 'quality', order: 'standard', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['standard', 'มาตรฐาน', 'select', { opts: QA_STANDARD_NAMES, r: 1, l: 1, filter: 1 }],
        ['indicator', 'ประเด็นพิจารณา', 'text', { r: 1, l: 1, max: 300 }],
        ['target', 'ค่าเป้าหมาย', 'text', { l: 1, max: 100 }],
        ['result', 'ผลการดำเนินงาน', 'text', { l: 1, max: 100 }],
        ['level', 'ระดับคุณภาพ', 'select', { opts: ['ยอดเยี่ยม', 'ดีเลิศ', 'ดี', 'ปานกลาง', 'กำลังพัฒนา'], l: 1 }],
        ['evidence', 'หลักฐาน/ร่องรอย', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์หลักฐาน', 'file', {}]
      ] },
    'portfolio': { sheet: 'Portfolios', label: 'แฟ้มสะสมผลงาน', module: 'portfolio', yearScoped: true, folder: 'awards',
      fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['personnelId', 'เจ้าของผลงาน', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['category', 'หมวด', 'select', { opts: ['การจัดการเรียนรู้', 'การพัฒนาตนเอง', 'งานที่ได้รับมอบหมาย', 'อื่น ๆ'], l: 1 }],
        ['title', 'ชื่อผลงาน', 'text', { r: 1, l: 1, max: 300 }],
        ['description', 'รายละเอียด', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์ผลงาน', 'file', {}]
      ] },
    'policy-library': { sheet: 'Policies', label: 'คลังนโยบาย', module: 'policy-library', folder: 'policies',
      order: '-effectiveDate', fields: [
        ['title', 'ชื่อนโยบาย', 'text', { r: 1, l: 1, max: 300 }],
        ['category', 'หมวด', 'text', { l: 1, max: 100 }],
        ['effectiveDate', 'วันที่มีผล', 'date', { l: 1 }],
        ['description', 'สาระสำคัญ', 'textarea', { max: 5000 }],
        ['fileId', 'ไฟล์', 'file', {}]
      ] },
    'documents': { sheet: 'Documents', label: 'คลังเอกสาร', module: 'documents', folder: 'policies',
      order: '-documentDate', fields: [
        ['documentNo', 'เลขที่หนังสือ', 'text', { l: 1, max: 60 }],
        ['documentDate', 'ลงวันที่', 'date', { l: 1 }],
        ['title', 'เรื่อง', 'text', { r: 1, l: 1, max: 300 }],
        ['direction', 'ประเภท', 'select', { opts: ['หนังสือรับ', 'หนังสือส่ง', 'คำสั่ง', 'ประกาศ', 'บันทึกข้อความ'], l: 1, filter: 1 }],
        ['fromTo', 'จาก/ถึง', 'text', { l: 1, max: 200 }],
        ['description', 'รายละเอียด', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์', 'file', {}]
      ] },
    'periods': { sheet: 'Periods', label: 'เวลาเรียนและคาบ', module: 'periods', order: 'periodNo', fields: [
        ['periodNo', 'คาบที่', 'number', { r: 1, l: 1, max: 12 }],
        ['label', 'ชื่อคาบ', 'text', { l: 1, max: 50 }],
        ['startTime', 'เวลาเริ่ม (เช่น 08:30)', 'text', { r: 1, l: 1, max: 5 }],
        ['endTime', 'เวลาสิ้นสุด', 'text', { r: 1, l: 1, max: 5 }]
      ] },
    'approval-positions': { sheet: 'ApprovalPositions', label: 'ตำแหน่งเพิ่มเติม (ผู้ลงนาม ปพ.5/ปพ.6)',
      module: 'approval-positions', yearScoped: true, fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['role', 'ตำแหน่งผู้ลงนาม', 'select', { opts: ['หัวหน้างานวัดผล', 'หัวหน้างานทะเบียน', 'รองผู้อำนวยการฝ่ายวิชาการ',
          'ผู้อำนวยการโรงเรียน'], r: 1, l: 1 }],
        ['personnelId', 'บุคลากร', 'ref', { ref: 'personnel', r: 1, l: 1 }]
      ] },
    'signatures': { sheet: 'Signatures', label: 'ลายเซ็น', module: 'signatures', folder: 'signatures', fields: [
        ['personnelId', 'บุคลากร', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['signatureFileId', 'ภาพลายเซ็น (PNG พื้นใส)', 'file', { r: 1, l: 1, accept: 'image/*' }],
        ['note', 'หมายเหตุ', 'text', { l: 1, max: 200 }]
      ] },

    // ===== ระบบดูแลช่วยเหลือนักเรียน (แบบ 5.1–5.6) =====
    'student-family': { sheet: 'StudentFamilies', label: 'ข้อมูลครอบครัว (5.1)', module: 'student-family', folder: 'care', fields: [
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['parentStatus', 'สถานภาพบิดามารดา', 'select', { opts: ['อยู่ด้วยกัน', 'แยกกันอยู่', 'หย่าร้าง', 'บิดาถึงแก่กรรม', 'มารดาถึงแก่กรรม', 'บิดาและมารดาถึงแก่กรรม'], l: 1 }],
        ['livingWith', 'พักอาศัยอยู่กับ', 'select', { opts: ['บิดาและมารดา', 'บิดา', 'มารดา', 'ญาติ', 'ผู้อุปการะ', 'อื่น ๆ'], l: 1 }],
        ['siblings', 'จำนวนพี่น้อง (รวมนักเรียน)', 'number', { max: 20 }],
        ['childOrder', 'เป็นบุตรคนที่', 'number', { max: 20 }],
        ['fatherName', 'ชื่อ-สกุล บิดา', 'text', { max: 150 }],
        ['fatherJob', 'อาชีพบิดา', 'text', { max: 100 }],
        ['fatherIncome', 'รายได้บิดา (บาท/เดือน)', 'number', { max: 10000000 }],
        ['motherName', 'ชื่อ-สกุล มารดา', 'text', { max: 150 }],
        ['motherJob', 'อาชีพมารดา', 'text', { max: 100 }],
        ['motherIncome', 'รายได้มารดา (บาท/เดือน)', 'number', { max: 10000000 }],
        ['guardianName', 'ผู้ปกครองที่ติดต่อได้', 'text', { max: 150, l: 1 }],
        ['guardianRelation', 'เกี่ยวข้องเป็น', 'text', { max: 50 }],
        ['guardianPhone', 'โทรศัพท์ผู้ปกครอง', 'text', { max: 30, l: 1 }],
        ['notes', 'หมายเหตุ', 'textarea', { max: 2000 }]
      ] },
    'screenings': { sheet: 'Screenings', label: 'คัดกรองนักเรียน (5.3)', module: 'screenings', yearScoped: true, order: '-screenDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['screenDate', 'วันที่คัดกรอง', 'date', { r: 1, l: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['learning', 'ด้านการเรียน', 'select', { opts: LEVEL3, r: 1, l: 1 }],
        ['health', 'ด้านสุขภาพ', 'select', { opts: LEVEL3, r: 1, l: 1 }],
        ['economy', 'ด้านเศรษฐกิจ', 'select', { opts: LEVEL3, r: 1, l: 1 }],
        ['protection', 'ด้านการคุ้มครองนักเรียน', 'select', { opts: LEVEL3, r: 1 }],
        ['drug', 'ด้านสารเสพติด', 'select', { opts: LEVEL3, r: 1 }],
        ['sexual', 'ด้านพฤติกรรมทางเพศ', 'select', { opts: LEVEL3, r: 1 }],
        ['result', 'ผลรวม (ด้านที่หนักที่สุด)', 'text', { l: 1, computed: 1 }],
        ['screenerId', 'ผู้คัดกรอง', 'ref', { ref: 'personnel' }],
        ['notes', 'หมายเหตุ', 'textarea', { max: 2000 }]
      ] },
    'counseling': { sheet: 'Counselings', label: 'บันทึกการให้คำปรึกษา (5.4)', module: 'counseling', yearScoped: true, order: '-counselDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['counselDate', 'วันที่ให้คำปรึกษา', 'date', { r: 1, l: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['issueType', 'ประเภทปัญหา', 'select', { opts: ['ด้านการเรียน', 'ด้านสุขภาพ', 'ด้านการปรับตัวและพฤติกรรม', 'ด้านครอบครัวและส่วนตัว', 'อื่น ๆ'], r: 1, l: 1, filter: 1 }],
        ['statement', 'ปัญหา/เรื่องที่ขอรับคำปรึกษา', 'textarea', { r: 1, max: 3000 }],
        ['solution', 'คำปรึกษา/การช่วยเหลือเบื้องต้น', 'textarea', { max: 3000 }],
        ['counselorId', 'ผู้ให้คำปรึกษา', 'ref', { ref: 'personnel', l: 1 }],
        ['followUp', 'ผลการติดตาม', 'textarea', { max: 3000 }],
        ['status', 'สถานะ', 'select', { opts: ['ติดตามผล', 'ดีขึ้น', 'ส่งต่อ', 'ยุติ'], l: 1 }]
      ] },
    'referrals': { sheet: 'Referrals', label: 'ส่งต่อนักเรียน (5.5)', module: 'referrals', yearScoped: true, folder: 'care', order: '-referDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['referDate', 'วันที่ส่งต่อ', 'date', { r: 1, l: 1 }],
        ['studentId', 'นักเรียน', 'ref', { ref: 'students', r: 1, l: 1 }],
        ['referType', 'ประเภทการส่งต่อ', 'select', { opts: ['ส่งต่อภายในสถานศึกษา', 'ส่งต่อหน่วยงานภายนอก (SPS)'], r: 1, l: 1, filter: 1 }],
        ['destination', 'ส่งถึง (บุคคล/หน่วยงาน)', 'text', { r: 1, l: 1, max: 200 }],
        ['reason', 'เหตุผลที่ส่งต่อ', 'textarea', { r: 1, max: 3000 }],
        ['teacherAction', 'การช่วยเหลือที่ครูดำเนินการแล้ว', 'textarea', { max: 3000 }],
        ['requestDetail', 'ความช่วยเหลือที่ขอเพิ่มเติม', 'textarea', { max: 3000 }],
        ['status', 'สถานะ', 'select', { opts: ['ส่งต่อแล้ว', 'ติดตามผล', 'ได้รับการช่วยเหลือ', 'ยุติ'], l: 1 }],
        ['referrerId', 'ผู้ส่งต่อ', 'ref', { ref: 'personnel' }],
        ['fileId', 'หนังสือส่งต่อ/เอกสาร', 'file', {}]
      ] },
    'aar': { sheet: 'AarRecords', label: 'ถอดบทเรียน AAR', module: 'aar', yearScoped: true, order: '-aarDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['aarDate', 'วันที่ถอดบทเรียน', 'date', { r: 1, l: 1 }],
        ['context', 'เรื่อง', 'select', { opts: ['ดูแลช่วยเหลือนักเรียน', 'ความปลอดภัย', 'กิจกรรม/โครงการ', 'อื่น ๆ'], r: 1, l: 1, filter: 1 }],
        ['eventName', 'กิจกรรม/เหตุการณ์', 'text', { r: 1, l: 1, max: 200 }],
        ['studentId', 'นักเรียนที่เกี่ยวข้อง (ถ้ามี)', 'ref', { ref: 'students' }],
        ['expected', 'สิ่งที่คาดหวัง', 'textarea', { max: 3000 }],
        ['actual', 'สิ่งที่เกิดขึ้นจริง', 'textarea', { max: 3000 }],
        ['rootCause', 'สาเหตุหลัก', 'textarea', { max: 3000 }],
        ['lessons', 'บทเรียนที่ได้รับ', 'textarea', { max: 3000 }],
        ['improvement', 'แนวทางพัฒนาครั้งต่อไป', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์ประกอบ', 'file', {}],
        // รหัสเหตุการณ์ความปลอดภัยที่ AAR นี้ถอดบทเรียน (ระบบใส่ให้เมื่อกดปุ่ม AAR ในแถวของเหตุการณ์)
        ['sourceId', 'อ้างอิงเหตุการณ์', 'text', { sys: 1, max: 60 }]
      ] },

    // ห้องรับฟัง: นักเรียนส่งเรื่องไม่สบายใจเองผ่านหน้าสาธารณะ (?page=concern) ทีมดูแลดูและตอบกลับที่หน้าเฉพาะของเมนูนี้
    // ข้อมูลอ่อนไหว: ไม่เข้าแคชร่วม ไม่มีสิทธิ์เริ่มต้นให้ครูทั่วไป และห้ามบันทึกผ่านฟอร์มกลาง (ดู EntityService.GUARDS)
    'student-concerns': { sheet: 'StudentConcerns', label: 'ห้องรับฟังนักเรียน', module: 'student-concerns', yearScoped: true,
      order: '-receivedDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['receivedDate', 'วันที่รับเรื่อง', 'date', { r: 1, l: 1 }],
        ['trackingCode', 'รหัสติดตาม', 'text', { l: 1, hide: 1, max: 12 }],
        ['topic', 'หัวข้อ', 'select', { opts: CONCERN_TOPICS.map(function (item) { return item[0]; }), r: 1, l: 1, filter: 1 }],
        ['aboutWho', 'เรื่องของใคร', 'select', { opts: ['ตัวฉันเอง', 'เพื่อนหรือคนที่ฉันรู้จัก'] }],
        ['urgency', 'ความเร่งด่วน', 'select', { opts: CONCERN_URGENCY, r: 1, l: 1, filter: 1, def: 'ปกติ' }],
        ['message', 'เรื่องที่นักเรียนเล่า', 'textarea', { r: 1, max: 2000 }],
        ['isAnonymous', 'ไม่ระบุตัวตน', 'checkbox', { l: 1 }],
        ['studentId', 'นักเรียน (ที่ระบบจับคู่ได้)', 'ref', { ref: 'students', l: 1 }],
        ['claimedStudent', 'ตัวตนที่ผู้แจ้งระบุ', 'text', { hide: 1, max: 250 }],
        ['contactNote', 'วิธี/ช่วงเวลาที่ติดต่อได้', 'text', { max: 200 }],
        ['preferred', 'อยากคุยกับ', 'select', { opts: ['ใครก็ได้', 'ครูแนะแนว', 'ครูที่ปรึกษา', 'ผู้บริหาร'] }],
        ['status', 'สถานะ', 'select', { opts: CONCERN_STATUSES, r: 1, l: 1, filter: 1, def: 'รอรับเรื่อง' }],
        ['assigneeId', 'ผู้ดูแลเรื่องนี้', 'ref', { ref: 'personnel', l: 1, filter: 1 }],
        ['followUpDate', 'วันนัดติดตาม', 'date', {}],
        ['internalNote', 'บันทึกภายในของทีม (นักเรียนไม่เห็น)', 'textarea', { max: 3000 }],
        ['counselingId', 'รหัสบันทึกให้คำปรึกษา (5.4)', 'text', { hide: 1, max: 60 }],
        ['threadJson', 'ข้อความโต้ตอบ', 'text', { hide: 1 }],
        ['hasNewMessage', 'มีข้อความใหม่จากนักเรียน', 'checkbox', { hide: 1 }]
      ] },

    // ===== ความปลอดภัย =====
    'safety-incidents': { sheet: 'SafetyIncidents', label: 'แจ้งเหตุความไม่ปลอดภัย', module: 'safety-incidents', yearScoped: true, folder: 'safety',
      order: '-incidentDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['incidentDate', 'วันที่เกิดเหตุ', 'date', { r: 1, l: 1 }],
        ['incidentTime', 'เวลา (เช่น 10:30)', 'text', { max: 5 }],
        ['category', 'กลุ่มภัย', 'select', { opts: HAZARD_GROUPS, r: 1, l: 1, filter: 1 }],
        ['hazardType', 'ประเภทภัย', 'select', { opts: HAZARD_TYPES, l: 1 }],
        ['severity', 'ระดับความรุนแรง', 'select', { opts: SEVERITIES, r: 1, l: 1 }],
        ['location', 'สถานที่', 'text', { r: 1, l: 1, max: 200 }],
        ['description', 'รายละเอียดเหตุการณ์', 'textarea', { r: 1, max: 3000 }],
        ['involved', 'ผู้เกี่ยวข้อง/จำนวน', 'text', { max: 300 }],
        ['initialAction', 'การดำเนินการเบื้องต้น', 'textarea', { max: 3000 }],
        ['status', 'สถานะ', 'select', { opts: ['รับแจ้ง', 'กำลังดำเนินการ', 'แก้ไขแล้ว', 'ส่งต่อ', 'ปิดเรื่อง'], r: 1, l: 1, filter: 1, def: 'รับแจ้ง' }],
        ['responsibleId', 'ผู้รับผิดชอบ', 'ref', { ref: 'personnel', filter: 1 }],
        ['resolution', 'ผลการแก้ไข', 'textarea', { max: 3000 }],
        ['resolvedDate', 'วันที่แก้ไขเสร็จ', 'date', {}],
        ['photoFileId', 'รูปภาพ', 'file', { accept: 'image/*' }],
        ['latitude', 'ละติจูด', 'text', { max: 20, geo: 'lat' }],
        ['longitude', 'ลองจิจูด', 'text', { max: 20, geo: 'lng' }]
      ] },
    'safety-risks': { sheet: 'SafetyRisks', label: 'จุดเสี่ยงในโรงเรียน', module: 'safety-risks', yearScoped: true, folder: 'safety', order: '-foundDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['foundDate', 'วันที่พบ', 'date', { r: 1, l: 1 }],
        ['location', 'จุด/สถานที่', 'text', { r: 1, l: 1, max: 200 }],
        ['category', 'กลุ่มภัย', 'select', { opts: HAZARD_GROUPS, l: 1, filter: 1 }],
        ['detail', 'ลักษณะความเสี่ยง', 'textarea', { r: 1, max: 3000 }],
        ['riskLevel', 'ระดับความเสี่ยง', 'select', { opts: ['ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก'], r: 1, l: 1, filter: 1 }],
        ['responsibleId', 'ผู้รับผิดชอบแก้ไข', 'ref', { ref: 'personnel', l: 1 }],
        ['dueDate', 'กำหนดแก้ไขเสร็จ', 'date', {}],
        ['status', 'สถานะ', 'select', { opts: ['รอดำเนินการ', 'กำลังแก้ไข', 'แก้ไขแล้ว'], r: 1, l: 1, filter: 1, def: 'รอดำเนินการ' }],
        ['fixDetail', 'การแก้ไข', 'textarea', { max: 3000 }],
        ['fixedDate', 'วันที่แก้ไขเสร็จ', 'date', {}],
        ['photoFileId', 'รูปก่อนแก้ไข', 'file', { accept: 'image/*' }],
        ['afterPhotoFileId', 'รูปหลังแก้ไข', 'file', { accept: 'image/*' }],
        ['latitude', 'ละติจูด', 'text', { max: 20, geo: 'lat' }],
        ['longitude', 'ลองจิจูด', 'text', { max: 20, geo: 'lng' }]
      ] },
    'sps-plan': { sheet: 'SpsActivities', label: 'แผนกิจกรรมความปลอดภัย (SPS)', module: 'sps-plan', yearScoped: true, folder: 'safety', order: 'category', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['category', 'กลุ่มภัย', 'select', { opts: HAZARD_GROUPS, r: 1, l: 1, filter: 1 }],
        ['activity', 'กิจกรรม', 'text', { r: 1, l: 1, max: 300 }],
        ['objective', 'วัตถุประสงค์', 'textarea', { max: 2000 }],
        ['target', 'กลุ่มเป้าหมาย', 'text', { l: 1, max: 200 }],
        ['period', 'ช่วงเวลา', 'text', { l: 1, max: 100 }],
        ['responsibleId', 'ผู้รับผิดชอบ', 'ref', { ref: 'personnel', l: 1 }],
        ['budget', 'งบประมาณ (บาท)', 'number', { max: 100000000 }],
        ['status', 'สถานะ', 'select', { opts: ['ยังไม่เริ่ม', 'กำลังดำเนินการ', 'เสร็จสิ้น'], l: 1, def: 'ยังไม่เริ่ม' }],
        ['result', 'ผลการดำเนินงาน', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์ประกอบ', 'file', {}]
      ] },

    // ===== นิเทศและ PLC =====
    'supervision-criteria': { sheet: 'SupervisionCriteria', label: 'เกณฑ์การนิเทศ', module: 'supervision-criteria', order: 'formType,sortNo', fields: [
        ['formType', 'แบบนิเทศ', 'select', { opts: SUPERVISION_FORMS, r: 1, l: 1, filter: 1 }],
        ['sortNo', 'ลำดับ', 'number', { r: 1, l: 1, max: 999 }],
        ['item', 'รายการประเมิน', 'text', { r: 1, l: 1, max: 300 }],
        ['maxScore', 'คะแนนเต็ม', 'number', { r: 1, l: 1, max: 100, def: 5 }],
        ['isActive', 'ใช้งาน', 'checkbox', { l: 1, def: true }]
      ] },
    'plc': { sheet: 'PlcRecords', label: 'บันทึก PLC', module: 'plc', yearScoped: true, folder: 'supervision', order: '-meetingDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['meetingDate', 'วันที่', 'date', { r: 1, l: 1 }],
        ['teamName', 'ชื่อกลุ่ม PLC', 'text', { r: 1, l: 1, max: 150 }],
        ['subjectGroupId', 'กลุ่มสาระฯ', 'ref', { ref: 'subjectGroups', l: 1 }],
        ['topic', 'ประเด็น/ปัญหาที่ร่วมพัฒนา', 'text', { r: 1, l: 1, max: 300 }],
        ['members', 'สมาชิก', 'textarea', { max: 2000 }],
        ['problem', '1. สภาพปัญหา', 'textarea', { max: 3000 }],
        ['plan', '5. กิจกรรมดำเนินงาน', 'textarea', { max: 3000 }],
        ['result', '6. ผลที่ได้รับ', 'textarea', { max: 3000 }],
        ['reflection', '11. แนวทางปรับปรุง', 'textarea', { max: 3000 }],
        ['fileId', 'ไฟล์ประกอบ', 'file', {}],
        // แบบบันทึก PLC 13 ประเด็น (ช่องเดิมด้านบนคือประเด็น 1, 5, 6, 11) ฟอร์มเรียงลำดับใหม่ในหน้าเว็บ
        ['memberIds', 'สมาชิก (เลือกจากบุคลากร)', 'text', { multi: 'personnel', max: 4000 }],
        ['objective', '2. วัตถุประสงค์', 'textarea', { max: 3000 }],
        ['cause', '3. สาเหตุของปัญหา', 'textarea', { max: 3000 }],
        ['knowledge', '4. ความรู้/หลักการที่ใช้', 'textarea', { max: 3000 }],
        ['otherKnowledge', '7. ความรู้อื่น ๆ ที่ได้', 'textarea', { max: 3000 }],
        ['application', '8. การประยุกต์ใช้', 'textarea', { max: 3000 }],
        ['obstacle', '9. อุปสรรค', 'textarea', { max: 3000 }],
        ['goodPractice', '10. ข้อควรปฏิบัติ', 'textarea', { max: 3000 }],
        ['innovationName', '12. ชื่อนวัตกรรม', 'text', { max: 300 }],
        ['innovationFor', '12. นวัตกรรมสำหรับ (กลุ่มเป้าหมาย)', 'text', { max: 300 }],
        ['isSuccess', '13. ผลการดำเนินงาน', 'select', { opts: ['สำเร็จ', 'ยังไม่สำเร็จ'], l: 1 }],
        ['successReason', '13. เหตุผลประกอบ', 'textarea', { max: 2000 }],
        ['photo1FileId', 'ภาพประกอบ 1', 'file', { accept: 'image/*' }],
        ['photo2FileId', 'ภาพประกอบ 2', 'file', { accept: 'image/*' }]
      ] },

    // ===== ประเมิน ว.23 =====
    'pa-criteria': { sheet: 'PaCriteria', label: 'หัวข้อประเมิน ว.23', module: 'pa-criteria', order: 'template,component,sortNo', fields: [
        ['template', 'ตำแหน่ง/วิทยฐานะ', 'select', { opts: PA_TEMPLATES.map(function (item) { return item.name; }), r: 1, l: 1, filter: 1 }],
        ['component', 'องค์ประกอบ/ด้าน', 'select', { opts: PA_COMPONENTS.map(function (item) { return item.name; }), r: 1, l: 1, filter: 1 }],
        ['sortNo', 'ลำดับ', 'number', { r: 1, l: 1, max: 999 }],
        ['item', 'ตัวชี้วัด/รายการ', 'text', { r: 1, l: 1, max: 300 }],
        ['description', 'คำอธิบาย', 'textarea', { max: 1000 }],
        ['evidence', 'ร่องรอย/หลักฐาน', 'text', { max: 300 }]
      ] },
    'pa-evaluations': { sheet: 'PaEvaluations', label: 'มอบหมายประเมิน ว.23', module: 'pa-evaluations', yearScoped: true, order: 'round', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['round', 'รอบการประเมิน', 'select', { opts: PA_ROUNDS, r: 1, l: 1, filter: 1 }],
        ['teacherId', 'ผู้รับการประเมิน', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['template', 'ตำแหน่ง/วิทยฐานะ', 'select', { opts: PA_TEMPLATES.map(function (item) { return item.name; }), r: 1, l: 1 }],
        ['committee1Id', 'ประธานกรรมการ', 'ref', { ref: 'personnel', r: 1, l: 1 }],
        ['committee2Id', 'กรรมการคนที่ 2', 'ref', { ref: 'personnel', r: 1 }],
        ['committee3Id', 'กรรมการคนที่ 3', 'ref', { ref: 'personnel', r: 1 }],
        ['challengeTopic', 'ประเด็นท้าทาย', 'textarea', { max: 1000 }],
        ['status', 'สถานะ', 'text', { l: 1, computed: 1 }],
        ['totalScore', 'คะแนนรวม (เต็ม 100)', 'number', { l: 1, computed: 1 }],
        ['result', 'ผลการประเมิน', 'text', { l: 1, computed: 1 }]
      ] },

    // ===== SWOT =====
    'swot-issues': { sheet: 'SwotIssues', label: 'ประเด็นวิเคราะห์ SWOT', module: 'swot-issues', yearScoped: true, order: 'category', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['category', 'ด้าน', 'select', { opts: SWOT_CATEGORIES.map(function (item) { return item.name; }), r: 1, l: 1, filter: 1 }],
        ['impact', 'ผลกระทบ', 'select', { opts: SWOT_IMPACTS, r: 1, l: 1, filter: 1 }],
        ['issue', 'ประเด็น', 'text', { r: 1, l: 1, max: 300 }],
        ['isActive', 'ใช้ในแบบสอบถาม', 'checkbox', { l: 1, def: true }],
        // คอลัมน์ที่เพิ่มภายหลังต้องต่อท้ายเสมอ (ตารางที่มีข้อมูลแล้วเพิ่มคอลัมน์ได้เฉพาะท้ายตาราง)
        ['question', 'คำถามสำหรับผู้ตอบทั่วไป (ภาษาง่าย)', 'textarea', { max: 300 }],
        ['audiences', 'กลุ่มผู้ตอบที่เห็นข้อนี้ (ว่าง = ทุกกลุ่ม)', 'text', { max: 300 }],
        ['standard', 'มาตรฐานที่เกี่ยวข้อง', 'select', { opts: QA_STANDARD_NAMES }]
      ] },
    // ประเด็นความต้องการจำเป็น: ตอบ 2 ช่อง (สภาพปัจจุบัน D / สภาพที่ควรจะเป็น I) → PNImodified = (I − D) / D
    'needs-items': { sheet: 'NeedsItems', label: 'ประเด็นความต้องการจำเป็น', module: 'needs-items', yearScoped: true, order: 'mainIssue', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['standard', 'มาตรฐาน', 'select', { opts: QA_STANDARD_NAMES, r: 1, l: 1, filter: 1 }],
        ['mainIssue', 'ประเด็นหลัก (ประเด็นพิจารณา)', 'text', { r: 1, l: 1, max: 10 }],
        ['subIssue', 'ประเด็นรอง', 'text', { l: 1, max: 10 }],
        ['item', 'ประเด็นความต้องการจำเป็น', 'text', { r: 1, l: 1, max: 300 }],
        ['question', 'คำถามสำหรับผู้ตอบทั่วไป (ภาษาง่าย)', 'textarea', { max: 300 }],
        ['audiences', 'กลุ่มผู้ตอบที่เห็นข้อนี้ (ว่าง = ทุกกลุ่ม)', 'text', { max: 300 }],
        ['isActive', 'ใช้ในแบบสอบถาม', 'checkbox', { l: 1, def: true }]
      ] },
    // โครงการตามกลยุทธ์ (แผนปฏิบัติการ): ผูกกลยุทธ์ + มาตรฐาน ประเด็นหลัก ประเด็นรอง
    'projects': { sheet: 'Projects', label: 'โครงการตามกลยุทธ์', module: 'projects', yearScoped: true, folder: 'quality', order: 'code', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['code', 'รหัสโครงการ', 'text', { l: 1, max: 20 }],
        ['name', 'ชื่อโครงการ', 'text', { r: 1, l: 1, max: 300 }],
        ['strategyId', 'กลยุทธ์', 'ref', { ref: 'strategies', r: 1, l: 1, filter: 1 }],
        ['standard', 'มาตรฐาน', 'select', { opts: QA_STANDARD_NAMES, r: 1, l: 1, filter: 1 }],
        ['mainIssues', 'ประเด็นหลัก (เช่น 1.1)', 'text', { max: 200 }],
        ['subIssues', 'ประเด็นรอง (เช่น 1.1.1)', 'text', { max: 300 }],
        ['department', 'งาน/ฝ่าย', 'select', { opts: PROJECT_DEPARTMENTS, filter: 1 }],
        ['responsibleId', 'ผู้รับผิดชอบ', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['teamIds', 'ผู้ร่วมรับผิดชอบ', 'text', { multi: 'personnel', max: 2000 }],
        ['rationale', 'หลักการและเหตุผล', 'textarea', { max: 5000 }],
        ['objectives', 'วัตถุประสงค์', 'textarea', { r: 1, max: 3000 }],
        ['targetQuantity', 'เป้าหมายเชิงปริมาณ', 'textarea', { max: 2000 }],
        ['targetQuality', 'เป้าหมายเชิงคุณภาพ', 'textarea', { max: 2000 }],
        ['activities', 'กิจกรรมและขั้นตอนดำเนินงาน (PDCA)', 'textarea', { max: 5000 }],
        ['startDate', 'เริ่มดำเนินการ', 'date', {}],
        ['endDate', 'สิ้นสุด', 'date', {}],
        ['budget', 'งบประมาณ (บาท)', 'number', { l: 1, max: 100000000 }],
        ['budgetSource', 'แหล่งงบประมาณ', 'select', { opts: PROJECT_BUDGET_SOURCES }],
        ['kpi', 'ตัวชี้วัดความสำเร็จและวิธีประเมิน', 'textarea', { max: 3000 }],
        ['expected', 'ผลที่คาดว่าจะได้รับ', 'textarea', { max: 3000 }],
        ['status', 'สถานะ', 'select', { opts: PROJECT_STATUSES, l: 1, filter: 1, def: 'เสนอโครงการ' }],
        ['fileId', 'ไฟล์โครงการ', 'file', {}]
      ] },
    // รายงานผลโครงการ: 1 รายงานต่อ 1 โครงการ · ผลรวม (result) ระบบตัดสินจากผลเทียบเป้าหมาย
    'project-reports': { sheet: 'ProjectReports', label: 'รายงานผลโครงการ', module: 'project-reports', yearScoped: true, folder: 'quality',
      order: '-reportDate', fields: [
        ['academicYearId', 'ปีการศึกษา', 'year', { r: 1 }],
        ['projectId', 'โครงการ', 'ref', { ref: 'projects', r: 1, l: 1 }],
        ['reporterId', 'ผู้รายงาน', 'ref', { ref: 'personnel', r: 1, l: 1, filter: 1 }],
        ['reportDate', 'วันที่รายงาน', 'date', { r: 1, l: 1 }],
        ['activitiesDone', 'กิจกรรมที่ดำเนินการ', 'textarea', { r: 1, max: 5000 }],
        ['quantResult', 'ผลเชิงปริมาณที่ได้จริง', 'textarea', { max: 3000 }],
        ['quantStatus', 'เทียบเป้าหมายเชิงปริมาณ', 'select', { opts: TARGET_STATUSES, r: 1 }],
        ['qualResult', 'ผลเชิงคุณภาพที่ได้จริง', 'textarea', { max: 3000 }],
        ['qualStatus', 'เทียบเป้าหมายเชิงคุณภาพ', 'select', { opts: TARGET_STATUSES, r: 1 }],
        ['budgetUsed', 'งบประมาณที่ใช้จริง (บาท)', 'number', { l: 1, max: 100000000 }],
        ['participants', 'ผู้เข้าร่วม (คน)', 'number', { max: 100000 }],
        ['satisfaction', 'ความพึงพอใจเฉลี่ย (เต็ม 5)', 'number', { max: 5 }],
        ['outcome', 'ผลที่เกิดกับผู้เรียน ครู และโรงเรียน', 'textarea', { max: 3000 }],
        ['problems', 'ปัญหาและอุปสรรค', 'textarea', { max: 3000 }],
        ['suggestions', 'ข้อเสนอแนะและแนวทางพัฒนาครั้งต่อไป', 'textarea', { max: 3000 }],
        ['result', 'ผลการดำเนินงาน', 'text', { l: 1, computed: 1 }],
        ['photo1FileId', 'ภาพกิจกรรม 1', 'file', { accept: 'image/*' }],
        ['photo2FileId', 'ภาพกิจกรรม 2', 'file', { accept: 'image/*' }],
        ['photo3FileId', 'ภาพกิจกรรม 3', 'file', { accept: 'image/*' }],
        ['photo4FileId', 'ภาพกิจกรรม 4', 'file', { accept: 'image/*' }],
        ['fileId', 'ไฟล์รายงาน/หลักฐาน', 'file', {}]
      ] }
  };

  Object.keys(ENTITIES).forEach(function (key) {
    var entity = ENTITIES[key];
    entity.key = key;
    entity.fields = entity.fields.map(function (field) {
      var options = field[3] || {};
      return { key: field[0], label: field[1], type: field[2], required: options.r === 1, list: options.l === 1,
        ref: options.ref || '', options: options.opts || [], max: options.max || 0, filter: options.filter === 1,
        computed: options.computed === 1 || options.hide === 1, hidden: options.hide === 1, geo: options.geo || '',
        accept: options.accept || '', defaultValue: options.def, system: options.sys === 1, multi: options.multi || '' };
    });
    SHEETS[entity.sheet] = columns(entity.fields.map(function (field) { return field.key; }));
  });

  // ---------- เมนูทั้งหมด (จัดเป็นหมวดแบบพับได้) ----------
  var GROUPS = [
    { key: 'top', name: '', icon: '' },
    { key: 'account', name: 'บัญชีของฉัน', icon: 'fa-user' },
    { key: 'records', name: 'งานบันทึกและติดตาม', icon: 'fa-pen' },
    { key: 'care', name: 'ดูแลช่วยเหลือนักเรียน', icon: 'fa-hand-holding-heart' },
    { key: 'safety', name: 'ความปลอดภัย', icon: 'fa-shield-heart' },
    { key: 'supervise', name: 'นิเทศและ PLC', icon: 'fa-person-chalkboard' },
    { key: 'personnel-work', name: 'งานบุคคลและการประเมิน', icon: 'fa-user-check' },
    { key: 'reports', name: 'รายงาน', icon: 'fa-chart-simple' },
    { key: 'information', name: 'สารสนเทศ', icon: 'fa-chart-pie' },
    { key: 'quality', name: 'ประกันคุณภาพ (SAR)', icon: 'fa-shield-halved' },
    { key: 'strategy', name: 'แผนกลยุทธ์ (SWOT)', icon: 'fa-chess' },
    { key: 'registry', name: 'ทะเบียนและข้อมูลหลัก', icon: 'fa-database' },
    { key: 'system', name: 'จัดการระบบ', icon: 'fa-gear' },
    { key: 'access', name: 'ผู้ใช้และสิทธิ์', icon: 'fa-user-shield' },
    { key: 'external', name: 'ระบบภายนอก', icon: 'fa-plug' }
  ];

  // [key, ชื่อเมนู, หมวด, route, ไอคอน, สี, สิทธิ์ที่ต้องมี]
  var MODULES = [
    ['dashboard', 'แดชบอร์ด', 'top', '#/dashboard', 'fa-chart-line', 'sky', 'dashboard.view'],
    ['app-center', 'แอปทั้งหมด', 'top', '#/apps', 'fa-table-cells-large', 'sky', 'dashboard.view'],

    ['profile', 'โปรไฟล์ของฉัน', 'account', '#/profile', 'fa-id-badge', 'sky', 'dashboard.view'],
    ['signatures', 'ลายเซ็นของฉัน', 'account', '#/signatures', 'fa-signature', 'violet', 'signature.view'],

    ['attendance', 'บันทึกการมาเรียน', 'records', '#/attendance', 'fa-clipboard-user', 'sky', 'attendance.view'],
    ['homeroom', 'ครูที่ปรึกษา', 'records', '#/homeroom', 'fa-chalkboard-user', 'violet', 'homeroom.view'],
    ['homeroom-logs', 'บันทึกโฮมรูม', 'records', '#/homeroom-logs', 'fa-sun', 'amber', 'homeroomLog.view'],
    ['student-care', 'แฟ้มดูแลนักเรียนรายคน', 'care', '#/student-care', 'fa-book-open-reader', 'violet', 'care.view'],
    ['student-family', 'ข้อมูลครอบครัว (5.1)', 'care', '#/student-family', 'fa-people-roof', 'teal', 'care.view'],
    ['home-visits', 'เยี่ยมบ้าน (5.2)', 'care', '#/home-visits', 'fa-house', 'green', 'homeVisit.view'],
    ['home-map', 'แผนที่บ้านนักเรียน', 'care', '#/home-map', 'fa-map-location-dot', 'green', 'homeVisit.view'],
    ['screenings', 'คัดกรองนักเรียน (5.3)', 'care', '#/screenings', 'fa-filter', 'amber', 'care.view'],
    ['sdq', 'แบบประเมิน SDQ', 'care', '#/sdq', 'fa-brain', 'rose', 'sdq.view'],
    ['counseling', 'ให้คำปรึกษา (5.4)', 'care', '#/counseling', 'fa-comments', 'sky', 'care.view'],
    ['referrals', 'ส่งต่อนักเรียน (5.5)', 'care', '#/referrals', 'fa-share-from-square', 'rose', 'care.view'],
    ['aar', 'ถอดบทเรียน AAR', 'care', '#/aar', 'fa-lightbulb', 'amber', 'care.view'],
    ['student-support', 'ระบบดูแลช่วยเหลือ', 'care', '#/student-support', 'fa-hand-holding-heart', 'pink', 'support.view'],
    ['student-concerns', 'ห้องรับฟังนักเรียน', 'care', '#/student-concerns', 'fa-ear-listen', 'rose', 'concern.view'],

    ['safety-dashboard', 'ภาพรวมความปลอดภัย', 'safety', '#/safety-dashboard', 'fa-shield-heart', 'rose', 'safety.view'],
    ['safety-incidents', 'แจ้งเหตุความไม่ปลอดภัย', 'safety', '#/safety-incidents', 'fa-triangle-exclamation', 'rose', 'safety.view'],
    ['safety-risks', 'จุดเสี่ยงในโรงเรียน', 'safety', '#/safety-risks', 'fa-helmet-safety', 'amber', 'safety.view'],
    ['sps-plan', 'แผนกิจกรรม SPS', 'safety', '#/sps-plan', 'fa-list-check', 'teal', 'safety.view'],

    ['supervision', 'นิเทศการสอน', 'supervise', '#/supervision', 'fa-person-chalkboard', 'teal', 'supervision.view'],
    ['supervision-criteria', 'เกณฑ์การนิเทศ', 'supervise', '#/supervision-criteria', 'fa-list-ol', 'cyan', 'supervision.view'],
    ['plc', 'บันทึก PLC', 'supervise', '#/plc', 'fa-people-group', 'violet', 'plc.view'],

    ['checkin', 'ลงเวลามาทำงาน', 'personnel-work', '#/checkin', 'fa-fingerprint', 'blue', 'checkin.view'],
    ['checkin-report', 'รายงานการมาทำงาน', 'personnel-work', '#/checkin-report', 'fa-calendar-check', 'green', 'checkinReport.view'],
    ['leave-requests', 'ขอลา / ไปราชการ', 'personnel-work', '#/leave-requests', 'fa-calendar-minus', 'orange', 'leave.view'],
    ['dev-reports', 'รายงานไปราชการ / พัฒนาตนเอง', 'personnel-work', '#/dev-reports', 'fa-file-signature', 'teal', 'devReport.view'],
    ['report-reviews', 'ส่งรายงานถึงผู้บริหาร', 'personnel-work', '#/report-reviews', 'fa-stamp', 'rose', 'review.view'],
    ['pa-my', 'ประเมิน ว.23 ของฉัน', 'personnel-work', '#/pa-my', 'fa-star-half-stroke', 'amber', 'paSelf.view'],
    ['pa-evaluations', 'มอบหมายและสรุปผล ว.23', 'personnel-work', '#/pa-evaluations', 'fa-clipboard-list', 'violet', 'paAdmin.view'],
    ['pa-criteria', 'หัวข้อประเมิน ว.23', 'personnel-work', '#/pa-criteria', 'fa-list-check', 'teal', 'paAdmin.view'],
    ['lesson-plans', 'แผนการสอน', 'records', '#/lesson-plans', 'fa-file-lines', 'cyan', 'lessonPlan.view'],
    ['teaching-logs', 'บันทึกหลังการสอน', 'records', '#/teaching-logs', 'fa-book-bookmark', 'violet', 'teachingLog.view'],
    ['timetable', 'ตารางสอน', 'records', '#/timetable', 'fa-table', 'blue', 'timetable.view'],
    ['teaching-load', 'ภาระงานสอน', 'records', '#/teaching-load', 'fa-clock', 'amber', 'teachingLoad.view'],
    ['porpor5', 'ปพ.5 บันทึกผลการเรียน', 'records', '#/porpor5', 'fa-file-csv', 'green', 'porpor5.view'],
    ['attendance-register', 'บันทึกเวลาเรียน', 'records', '#/attendance-register', 'fa-calendar-check', 'blue', 'attendance.view'],

    ['attendance-reports', 'รายงานการมาเรียน', 'reports', '#/attendance-reports', 'fa-chart-column', 'green', 'attendanceReport.view'],
    ['late-absence', 'สรุปมาสายและขาดเรียน', 'reports', '#/late-absence', 'fa-triangle-exclamation', 'amber', 'attendanceReport.view'],
    ['attendance-risk', 'เวลาเรียนไม่ถึง 80%', 'reports', '#/attendance-risk', 'fa-user-clock', 'rose', 'attendanceReport.view'],
    ['attendance-history', 'ประวัติการมาเรียนรายคน', 'reports', '#/attendance-history', 'fa-clock-rotate-left', 'sky', 'attendanceReport.view'],
    ['attendance-export', 'ส่งออกข้อมูลการมาเรียน', 'reports', '#/attendance-export', 'fa-file-export', 'sky', 'attendance.export'],
    ['porpor5-report', 'รายงาน ปพ.5', 'reports', '#/porpor5-report', 'fa-chart-line', 'green', 'porpor5.view'],
    ['porpor6', 'ปพ.6 รายบุคคล', 'reports', '#/porpor6', 'fa-address-card', 'violet', 'porpor6.view'],
    ['information-report', 'รายงานสารสนเทศ', 'reports', '#/information-report', 'fa-chart-pie', 'cyan', 'studentInfo.view'],
    ['awards-report', 'รายงานผลงานและรางวัล', 'reports', '#/awards-report', 'fa-trophy', 'amber', 'award.view'],
    ['sar-report', 'รายงาน SAR', 'reports', '#/sar-report', 'fa-clipboard-check', 'violet', 'sar.view'],

    ['student-information', 'สารสนเทศรายบุคคล', 'information', '#/student-information', 'fa-id-card', 'cyan', 'studentInfo.view'],
    ['awards', 'ผลงานและรางวัล', 'information', '#/awards', 'fa-trophy', 'amber', 'award.view'],
    ['scholarships', 'ทุนการศึกษา', 'information', '#/scholarships', 'fa-hand-holding-dollar', 'green', 'scholarship.view'],
    ['portfolio', 'แฟ้มสะสมผลงาน', 'information', '#/portfolio', 'fa-folder-open', 'orange', 'portfolio.view'],
    ['ai-assistant', 'ผู้ช่วย AI', 'information', '#/ai-assistant', 'fa-wand-magic-sparkles', 'violet', 'ai.use'],

    ['school-basic', 'ข้อมูลพื้นฐานของโรงเรียน', 'quality', '#/school-basic', 'fa-school', 'blue', 'sar.view'],
    ['teacher-basic', 'ข้อมูลพื้นฐานของครู', 'quality', '#/teacher-basic', 'fa-users', 'violet', 'sar.view'],
    ['sar', 'เนื้อหารายงาน SAR', 'quality', '#/sar', 'fa-file-pen', 'violet', 'sar.view'],
    ['quality-assurance', 'มาตรฐานและประเด็นพิจารณา', 'quality', '#/quality-assurance', 'fa-shield-halved', 'teal', 'qa.view'],

    // แผนกลยุทธ์: เรียงตามลำดับการทำงาน ประเด็น → แบบสอบถาม → ผลวิเคราะห์ → TOWS → ทิศทาง → โครงการ → รายงานผล
    ['swot-issues', 'ประเด็นวิเคราะห์ SWOT', 'strategy', '#/swot-issues', 'fa-list', 'teal', 'swot.view'],
    ['needs-items', 'ประเด็นความต้องการจำเป็น', 'strategy', '#/needs-items', 'fa-list-check', 'amber', 'swot.view'],
    ['swot', 'แบบสอบถาม SWOT และ Needs', 'strategy', '#/swot', 'fa-square-poll-vertical', 'green', 'swot.view'],
    ['swot-result', 'ผลวิเคราะห์ SWOT และ Needs', 'strategy', '#/swot-result', 'fa-chart-pie', 'violet', 'swot.view'],
    ['tows', 'กลยุทธ์ TOWS Matrix', 'strategy', '#/tows', 'fa-chess-knight', 'sky', 'swot.view'],
    ['school-direction', 'วิสัยทัศน์ พันธกิจ กลยุทธ์', 'strategy', '#/school-direction', 'fa-compass', 'blue', 'swot.view'],
    ['projects', 'โครงการตามกลยุทธ์', 'strategy', '#/projects', 'fa-diagram-project', 'orange', 'project.view'],
    ['project-reports', 'รายงานผลโครงการ', 'strategy', '#/project-reports', 'fa-file-contract', 'rose', 'project.view'],

    ['students', 'ทะเบียนนักเรียน', 'registry', '#/students', 'fa-user-graduate', 'amber', 'student.view'],
    ['student-enrollments', 'นักเรียนรายห้อง/รายปี', 'registry', '#/student-enrollments', 'fa-list-ol', 'sky', 'enrollment.view'],
    ['personnel', 'ทะเบียนบุคลากร', 'registry', '#/personnel', 'fa-id-card-clip', 'teal', 'personnel.view'],
    ['personnel-years', 'บุคลากรรายปี', 'registry', '#/personnel-years', 'fa-briefcase', 'blue', 'personnelYear.view'],
    ['master-subject-groups', 'กลุ่มสาระฯ', 'registry', '#/master-subject-groups', 'fa-people-group', 'lime', 'master.view'],
    ['master-divisions', 'ฝ่าย', 'registry', '#/master-divisions', 'fa-sitemap', 'orange', 'master.view'],
    ['master-positions', 'ตำแหน่ง', 'registry', '#/master-positions', 'fa-user-tag', 'pink', 'master.view'],
    ['master-personnel-types', 'ประเภทบุคลากร', 'registry', '#/master-personnel-types', 'fa-address-card', 'cyan', 'master.view'],
    ['master-titles', 'คำนำหน้าชื่อ', 'registry', '#/master-titles', 'fa-id-card', 'pink', 'master.view'],
    ['master-standings', 'วิทยฐานะ', 'registry', '#/master-standings', 'fa-medal', 'amber', 'master.view'],

    ['admin-center', 'ศูนย์ผู้ดูแลระบบ', 'system', '#/admin', 'fa-screwdriver-wrench', 'rose', 'settings.view'],
    ['academic-years', 'ปีการศึกษา', 'system', '#/academic-years', 'fa-calendar-days', 'violet', 'academicYear.view'],
    ['periods', 'เวลาเรียนและคาบ', 'system', '#/periods', 'fa-business-time', 'violet', 'period.view'],
    ['calendar', 'ปฏิทินโรงเรียน', 'system', '#/calendar', 'fa-calendar', 'green', 'calendar.view'],
    ['homerooms', 'ตั้งค่าครูที่ปรึกษา', 'system', '#/homerooms', 'fa-users-gear', 'violet', 'homeroom.view'],
    ['approval-positions', 'ตำแหน่งเพิ่มเติม', 'system', '#/approval-positions', 'fa-user-pen', 'violet', 'approval.view'],
    ['announcements', 'ประกาศ', 'system', '#/announcements', 'fa-bullhorn', 'rose', 'announcement.view'],
    ['policy-library', 'นโยบาย', 'system', '#/policy-library', 'fa-sliders', 'pink', 'policy.view'],
    ['documents', 'คลังเอกสาร', 'system', '#/documents', 'fa-folder', 'blue', 'document.view'],
    ['landing-editor', 'ออกแบบหน้าแรก', 'system', '#/landing-editor', 'fa-wand-magic-sparkles', 'pink', 'settings.view'],
    ['school-profile', 'หน้าแรกและข้อมูลโรงเรียน', 'system', '#/school-profile', 'fa-school-flag', 'blue', 'settings.view'],
    ['year-close', 'ปิดปีการศึกษา', 'system', '#/year-close', 'fa-box-archive', 'amber', 'yearClose.manage'],
    ['menu-manager', 'จัดการเมนู', 'system', '#/menus', 'fa-toggle-on', 'green', 'module.toggle'],
    ['integrations', 'เชื่อมต่อระบบภายนอก', 'system', '#/integrations', 'fa-plug', 'teal', 'settings.view'],
    ['ai-settings', 'ตั้งค่า AI', 'system', '#/ai-settings', 'fa-robot', 'violet', 'aiSettings.view'],
    ['branding', 'ตั้งค่าระบบ', 'system', '#/settings', 'fa-gear', 'slate', 'settings.view'],
    // เฉพาะโรงเรียนหลัก (เจ้าของระบบ): ดูคำขอใช้ระบบและโรงเรียนที่ติดตั้งให้แล้ว
    ['distribution', 'โรงเรียนที่ขอใช้ระบบ', 'system', '#/distribution', 'fa-share-nodes', 'teal', 'distribution.manage', true],

    ['users', 'ผู้ใช้งาน', 'access', '#/users', 'fa-users', 'rose', 'user.view'],
    ['roles', 'บทบาทและสิทธิ์', 'access', '#/roles', 'fa-shield', 'rose', 'role.view'],
    ['audit-logs', 'บันทึกการใช้งาน', 'access', '#/audit-logs', 'fa-clock-rotate-left', 'slate', 'audit.view']
  ].map(function (item) {
    return { key: item[0], name: item[1], category: item[2], route: item[3], icon: item[4], color: item[5],
      permission: item[6], isAvailable: true, mainOnly: item[7] === true };
  });

  // หน้าข้อมูลหลักแต่ละหน้า -> ตารางใน MASTER_TABLES
  var MASTER_ROUTES = {
    'master-subject-groups': 'subject-groups', 'master-divisions': 'divisions', 'master-positions': 'positions',
    'master-personnel-types': 'personnel-types', 'master-titles': 'titles', 'master-standings': 'standings'
  };

  // สิทธิ์แก้ไขของแต่ละโมดูล = สิทธิ์ดูที่เปลี่ยน .view เป็น .edit
  function editPermissionOf(viewPermission) { return viewPermission.replace(/\.view$/, '.edit'); }
  var moduleByKey = MODULES.reduce(function (index, module) { index[module.key] = module; return index; }, {});
  Object.keys(ENTITIES).forEach(function (key) {
    var module = moduleByKey[ENTITIES[key].module];
    ENTITIES[key].viewPermission = module.permission;
    ENTITIES[key].editPermission = editPermissionOf(module.permission);
  });

  var PERMISSIONS = Array.from(new Set(MODULES.map(function (item) { return item.permission; })
    .concat(Object.keys(ENTITIES).map(function (key) { return ENTITIES[key].editPermission; }))
    .concat([
      'settings.edit', 'module.toggle', 'master.edit', 'academicYear.edit', 'user.add', 'user.edit', 'user.delete',
      'attendance.add', 'attendance.edit', 'attendance.submit', 'attendance.review', 'attendance.approve', 'attendance.export',
      'porpor5.grade', 'role.edit', 'sos.manage', 'aiSettings.edit', 'checkinReport.manage', 'texts.edit', 'leave.approve', 'safety.manage', 'review.approve'
    ])));

  var ALL_VIEW = MODULES.map(function (module) { return module.permission; })
    .filter(function (permission) {
      return ['user.view', 'role.view', 'settings.view', 'audit.view', 'module.toggle', 'yearClose.manage', 'aiSettings.view', 'paAdmin.view',
        'checkinReport.view', 'distribution.manage', 'concern.view'].indexOf(permission) === -1;
    });

  // เมนูที่ปิดไม่ได้ (กันผู้ดูแลระบบล็อกตัวเองออกจากหน้าตั้งค่า)
  var LOCKED_MODULES = ['dashboard', 'app-center', 'profile', 'branding', 'menu-manager', 'users', 'roles', 'admin-center'];
  var ESSENTIAL_MODULES = ['attendance', 'homeroom', 'porpor5', 'attendance-register', 'attendance-reports', 'late-absence',
    'porpor5-report', 'porpor6', 'students', 'student-enrollments', 'personnel', 'master-subject-groups', 'master-divisions',
    'master-positions', 'master-personnel-types', 'master-titles', 'master-standings', 'academic-years', 'periods', 'calendar',
    'homerooms', 'announcements', 'school-profile', 'integrations', 'audit-logs', 'year-close'];
  // ชุดเมนูสำเร็จรูป: กดครั้งเดียวแล้วปรับเองต่อได้
  var MENU_PRESETS = [
    { key: 'all', name: 'ครบทุกเมนู', icon: 'fa-layer-group', modules: MODULES.map(function (module) { return module.key; }) },
    { key: 'essential', name: 'ใช้แบบเบา (เฉพาะงานหลัก)', icon: 'fa-feather', modules: LOCKED_MODULES.concat(ESSENTIAL_MODULES) },
    { key: 'care', name: 'งานหลัก + ดูแลช่วยเหลือนักเรียน', icon: 'fa-hand-holding-heart',
      modules: LOCKED_MODULES.concat(ESSENTIAL_MODULES, ['homeroom-logs', 'student-care', 'student-family', 'home-visits', 'home-map', 'screenings', 'sdq',
        'counseling', 'referrals', 'aar', 'student-support', 'student-concerns', 'student-information', 'scholarships', 'safety-dashboard', 'safety-incidents',
        'safety-risks', 'sps-plan']) },
    { key: 'quality', name: 'งานหลัก + ประกันคุณภาพ/SAR', icon: 'fa-shield-halved',
      modules: LOCKED_MODULES.concat(ESSENTIAL_MODULES, ['school-basic', 'teacher-basic', 'sar', 'quality-assurance', 'sar-report',
        'awards', 'awards-report', 'supervision', 'supervision-criteria', 'plc', 'lesson-plans', 'teaching-logs', 'policy-library', 'documents', 'swot', 'swot-issues', 'needs-items',
        'swot-result', 'tows', 'school-direction', 'projects', 'project-reports']) }
  ];

  // ส่วนต่าง ๆ บนหน้าแรก (ก่อนเข้าสู่ระบบ) ที่ผู้ดูแลระบบเลือกเปิด/ปิดได้
  // ข้อความตัวอย่างทั่วไปของหน้าแรก ใช้เมื่อโรงเรียนยังไม่ได้กรอก (ไม่ใส่ข้อมูลเฉพาะ เช่น ที่อยู่ เบอร์โทร ชื่อผู้บริหาร)
  var SAMPLE_LANDING_CONTENT = {
    schoolMotto: 'เรียนดี มีวินัย ใฝ่คุณธรรม',
    schoolVision: 'โรงเรียนจัดการศึกษาอย่างมีคุณภาพ ผู้เรียนมีความรู้คู่คุณธรรม มีทักษะการเรียนรู้ในศตวรรษที่ 21 บนพื้นฐานความเป็นไทยและหลักปรัชญาของเศรษฐกิจพอเพียง',
    schoolMission: ['พัฒนาผู้เรียนให้มีคุณภาพตามมาตรฐานการศึกษาและหลักสูตร', 'ส่งเสริมให้ผู้เรียนมีคุณธรรม จริยธรรม และคุณลักษณะอันพึงประสงค์',
      'พัฒนาครูและบุคลากรให้มีสมรรถนะในการจัดการเรียนรู้', 'บริหารจัดการศึกษาแบบมีส่วนร่วมกับชุมชนและภาคีเครือข่าย',
      'จัดสภาพแวดล้อมและแหล่งเรียนรู้ที่เอื้อต่อการเรียนรู้'].join('\n'),
    schoolGoals: ['ผู้เรียนมีผลสัมฤทธิ์ทางการเรียนและคุณลักษณะอันพึงประสงค์ตามหลักสูตร', 'ครูจัดการเรียนรู้ที่เน้นผู้เรียนเป็นสำคัญและใช้เทคโนโลยีอย่างเหมาะสม',
      'โรงเรียนมีระบบบริหารจัดการที่มีคุณภาพ และชุมชนมีส่วนร่วมในการจัดการศึกษา', 'โรงเรียนมีสภาพแวดล้อมที่ปลอดภัย ร่มรื่น และเอื้อต่อการเรียนรู้'].join('\n'),
    schoolPhilosophy: 'การศึกษาคือรากฐานของการพัฒนาชีวิต',
    schoolIdentity: 'ยิ้ม ไหว้ ทักทาย'
  };

  var LANDING_SECTIONS = [
    ['ticker', 'ตัววิ่งกิจกรรมประจำเดือน (ใต้เมนูด้านบน)'], ['stats', 'ตัวเลขภาพรวม (จำนวนนักเรียน ครู ห้องเรียน)'],
    ['today', 'สถิติวันนี้ (นักเรียนมาเรียนรายชั้น และครูมาทำงาน แสดงชื่อเฉพาะผู้ไปราชการ)'],
    ['basic', 'ข้อมูลพื้นฐานโรงเรียน (ตารางข้อมูล จำนวนนักเรียนแยกชั้น และบุคลากร)'], ['about', 'แนะนำโรงเรียน (ประวัติ วิสัยทัศน์ พันธกิจ)'],
    ['director', 'ผู้บริหารโรงเรียน'], ['news', 'ข่าวประชาสัมพันธ์ (เฉพาะประกาศที่เลือก “แสดงบนหน้าแรก”)'],
    ['events', 'กิจกรรมที่จะถึง (จากปฏิทินโรงเรียน)'], ['gallery', 'ภาพบรรยากาศโรงเรียน'], ['contact', 'ติดต่อโรงเรียนและแผนที่'],
    ['emergency', 'เบอร์โทรฉุกเฉิน']
  ].map(function (item) { return { key: item[0], name: item[1] }; });

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SHEETS: SHEETS,
    ENTITIES: ENTITIES,
    MODULES: MODULES,
    GROUPS: GROUPS,
    LOCKED_MODULES: LOCKED_MODULES,
    MENU_PRESETS: MENU_PRESETS,
    LANDING_SECTIONS: LANDING_SECTIONS,
    SAMPLE_LANDING_CONTENT: SAMPLE_LANDING_CONTENT,
    MAX_GALLERY_IMAGES: 24,
    MAX_HERO_SLIDES: 10,
    // ฟอนต์ภาษาไทยจาก Google Fonts ที่เลือกใช้บนหน้าแรกได้
    LANDING_FONTS: ['Sarabun', 'Prompt', 'Kanit', 'Mitr', 'Noto Sans Thai', 'IBM Plex Sans Thai', 'Chakra Petch', 'Bai Jamjuree', 'Pridi', 'Taviraj'],
    MASTER_ROUTES: MASTER_ROUTES,
    HAZARD_GROUPS: HAZARD_GROUPS,
    CONCERN_TOPICS: CONCERN_TOPICS,
    CONCERN_URGENCY: CONCERN_URGENCY,
    CONCERN_STATUSES: CONCERN_STATUSES,
    SUPERVISION_FORMS: SUPERVISION_FORMS,
    SUPERVISION_STATUS: SUPERVISION_STATUS,
    PA_TEMPLATES: PA_TEMPLATES,
    PA_COMPONENTS: PA_COMPONENTS,
    SWOT_CATEGORIES: SWOT_CATEGORIES,
    SWOT_IMPACTS: SWOT_IMPACTS,
    SWOT_RESPONDENTS: SWOT_RESPONDENTS,
    QA_STANDARDS: QA_STANDARDS,
    QA_STANDARD_NAMES: QA_STANDARD_NAMES,
    PROJECT_STATUSES: PROJECT_STATUSES,
    TARGET_STATUSES: TARGET_STATUSES,
    // AI แยกตามเรื่อง: แต่ละเรื่องมี API key ผู้ให้บริการ และสิทธิ์ของตัวเอง (ตั้งค่าที่หน้า "ตั้งค่า AI")
    AI_FEATURES: [
      ['care', 'AI ดูแลช่วยเหลือนักเรียน', 'สรุปข้อมูลนักเรียนรายคนจากแบบ 5.1–5.5 (ส่งเฉพาะชื่อต้น ไม่ส่งนามสกุล เลขประจำตัว หรือเบอร์โทร)'],
      ['safety', 'AI ความปลอดภัย', 'วิเคราะห์เหตุการณ์ สรุปภาพรวมความปลอดภัย และแนะนำกิจกรรม SPS'],
      ['supervision', 'AI นิเทศการสอน', 'ช่วยร่างจุดเด่น จุดที่ควรพัฒนา และข้อเสนอแนะจากคะแนนนิเทศ'],
      ['pa', 'AI ประเมิน ว.23', 'ช่วยร่างความเห็นของกรรมการจากคะแนนรายข้อ'],
      ['swot', 'AI SWOT และแผนกลยุทธ์', 'ใช้ทั้งหมวดแผนกลยุทธ์: แปลงประเด็นเป็นคำถามภาษาง่าย เสนอประเด็น SWOT ร่าง TOWS วิสัยทัศน์ พันธกิจ เป้าประสงค์ กลยุทธ์ โครงการ เรียบเรียงรายงานผลโครงการ และเป็นสมองของบอท “น้องกลยุทธ์” (ถ้าไม่ใส่ key บอทนี้จะใช้ key ของน้องบอทแทน)'],
      ['assistant', 'AI ผู้ช่วยทั่วไป', 'ถามตอบเกี่ยวกับสถิติภาพรวมของโรงเรียน (ไม่ส่งข้อมูลรายบุคคล)'],
      ['bot', 'น้องบอท (แชทบอทประจำหน้า)', 'ปุ่ม “น้องบอท” บนแถบด้านบน ตอบคำถามจากข้อมูลของหน้าที่เปิดอยู่ มีบอทหลายตัวแยกตามงานให้ผู้ใช้เลือก ทุกตัวใช้ API key นี้ร่วมกัน แยกจาก AI เรื่องอื่น (ส่งเฉพาะชื่อต้นของนักเรียน ไม่ส่งนามสกุล เลขประจำตัว ที่อยู่ หรือเบอร์โทร)']
    ].map(function (item) { return { key: item[0], name: item[1], hint: item[2] }; }),
    // บอทประจำหน้าแยกตามงาน: ทุกตัวใช้ API key ของเรื่อง 'bot' ร่วมกัน ต่างกันที่ชื่อ สี ไอคอน และความถนัด
    // categories = หมวดเมนูที่บอทตัวนี้ถนัด (เปิดหน้าในหมวดนั้นแล้วบอทตัวนี้จะถูกเลือกให้ก่อน ผู้ใช้เปลี่ยนเองได้)
    BOTS: [
      { key: 'general', name: 'น้องบอท', role: 'ผู้ช่วยทั่วไป', icon: 'fa-comment-dots', color: '#1e3a5f', categories: [],
        persona: 'คุณช่วยสรุปและตอบคำถามจากข้อมูลได้ทุกเรื่องของโรงเรียน' },
      { key: 'care', name: 'น้องใส่ใจ', role: 'ดูแลช่วยเหลือนักเรียน', icon: 'fa-hand-holding-heart', color: '#0f766e', categories: ['care'],
        persona: 'คุณถนัดระบบดูแลช่วยเหลือนักเรียน 5 ขั้นตอน (รู้จักนักเรียนรายบุคคล คัดกรอง ส่งเสริมพัฒนา ป้องกันแก้ไข และส่งต่อ) ' +
          'มองหานักเรียนที่ควรได้รับการดูแล บอกเหตุผลจากข้อมูล และเสนอสิ่งที่ครูที่ปรึกษาทำต่อได้ ใช้ถ้อยคำที่ให้เกียรตินักเรียนและครอบครัว ไม่ตีตรา' },
      { key: 'safety', name: 'น้องปลอดภัย', role: 'ความปลอดภัยในโรงเรียน', icon: 'fa-shield-heart', color: '#b91c1c', categories: ['safety'],
        persona: 'คุณถนัดงานความปลอดภัยสถานศึกษาตามกลุ่มภัย 4 ด้าน (อุบัติเหตุ ความรุนแรง การละเมิดสิทธิ์ สุขภาวะทางกายและจิตใจ) ' +
          'จัดลำดับความเร่งด่วนตามความรุนแรง ชี้เหตุหรือจุดเสี่ยงที่ยังไม่ได้แก้ไข และเสนอมาตรการป้องกัน แก้ไข และติดตามที่ทำได้จริง' },
      { key: 'academic', name: 'น้องวิชาการ', role: 'งานวิชาการและการสอน', icon: 'fa-book-open', color: '#6d28d9', categories: ['records', 'supervise', 'quality'],
        persona: 'คุณถนัดงานวิชาการ การจัดการเรียนรู้ แผนการสอน การนิเทศ PLC และประกันคุณภาพ ' +
          'สรุปความก้าวหน้าของงาน ชี้สิ่งที่ยังขาดหรือค้าง และเสนอแนวทางพัฒนาการสอนที่ครูนำไปใช้ได้' },
      { key: 'personnel', name: 'น้องบุคคล', role: 'งานบุคคล', icon: 'fa-user-check', color: '#b45309', categories: ['personnel-work'],
        persona: 'คุณถนัดงานบุคคลของโรงเรียน เช่น การลา การไปราชการ การลงเวลา และการประเมิน ' +
          'สรุปสถิติให้ผู้บริหารเห็นภาพ ชี้รายการที่รอดำเนินการ และรายงานอย่างเป็นกลางโดยไม่ตัดสินตัวบุคคล' },
      // feature: ใช้ API key ของ AI เรื่องนี้ก่อน (ถ้ายังไม่ได้ตั้ง ใช้ key ของน้องบอท)
      { key: 'strategy', name: 'น้องกลยุทธ์', role: 'วิเคราะห์ SWOT และวางแผนกลยุทธ์', icon: 'fa-chess', color: '#7c2d12', categories: ['strategy'], feature: 'swot',
        persona: 'คุณเป็นที่ปรึกษาด้านการวางแผนกลยุทธ์สถานศึกษา ถนัดการอ่านผล SWOT ถ่วงน้ำหนัก (2S4M/PEST) ตำแหน่งในกราฟไข่แดง ' +
          'การจัดลำดับความต้องการจำเป็นด้วย PNImodified การจับคู่ TOWS การเขียนวิสัยทัศน์ พันธกิจ เป้าประสงค์ กลยุทธ์ ตัวชี้วัดแบบ SMART ' +
          'และการออกแบบโครงการที่ตอบมาตรฐานการศึกษาขั้นพื้นฐาน ชี้จุดที่แผนยังไม่เชื่อมโยงกัน และเสนอสิ่งที่ควรทำต่อเป็นลำดับ' }
    ],
    AI_PROVIDERS: [
      { key: 'gemini', name: 'Google Gemini', model: 'gemini-2.5-flash' },
      { key: 'typhoon', name: 'Typhoon (ภาษาไทย)', model: 'typhoon-v2.5-30b-a3b-instruct' },
      { key: 'openai', name: 'OpenAI', model: 'gpt-4o-mini' },
      { key: 'claude', name: 'Anthropic Claude', model: 'claude-haiku-4-5-20251001' }
    ],
    PASSWORD_MIN_LENGTH: 6,
    NO_SHARED_CACHE_SHEETS: ['Sessions', 'AuditLogs', 'AttendanceSessions', 'GradeSheets', 'Files', 'Summaries', 'StudentConcerns'],
    // ตารางที่โตเร็ว: ไม่โหลดพ่วงตอนอุ่นแคชรวม (โหลดเมื่อหน้าที่ใช้ตารางนั้นถูกเปิด)
    BULK_EXCLUDE_SHEETS: ['StaffCheckins', 'StudentConcerns'],
    GRADE_LEVELS: GRADE_LEVELS,
    SESSION_TTL_SECONDS: 8 * 60 * 60,
    REMEMBER_TTL_SECONDS: 14 * 24 * 60 * 60,
    PASSWORD_KDF_ITERATIONS: 10000,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_WINDOW_SECONDS: 300,
    SYSTEM_LOGIN_BUCKET_CAPACITY: 120,
    SYSTEM_LOGIN_REFILL_PER_SECOND: 1,
    MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
    DEFAULT_SETTINGS: {
      schoolName: 'ระบบบริหารจัดการโรงเรียน',
      schoolDescription: 'ระบบสารสนเทศเพื่อสนับสนุนการบริหารจัดการสถานศึกษา',
      logoFileId: '',
      primaryColor: '#1e3a5f',
      sidebarColor: '#0f1b33',
      themeKey: 'navy',
      allowSelfRegistration: false,
      // เบอร์โทรฉุกเฉินที่แสดงหลังกด SOS (ผู้ดูแลระบบแก้ไข/เพิ่มเบอร์ของโรงเรียนได้ที่หน้าตั้งค่าระบบ)
      emergencyContacts: [
        { name: 'เจ็บป่วยฉุกเฉิน (สพฉ.)', phone: '1669' }, { name: 'ตำรวจ', phone: '191' },
        { name: 'ดับเพลิง', phone: '199' }, { name: 'สายด่วนนิรภัย (ปภ.)', phone: '1784' },
        { name: 'ศูนย์ช่วยเหลือสังคม', phone: '1300' }, { name: 'สายด่วนสุขภาพจิต', phone: '1323' },
        { name: 'ศูนย์พิษวิทยา รพ.รามาธิบดี', phone: '1367' }
      ],
      footerText: 'ระบบบริหารจัดการโรงเรียน',
      schoolAffiliation: '',
      schoolAddress: '',
      schoolPhone: '',
      periodsPerDay: 8,
      directorName: '',
      academicHeadName: '',
      // ข้อมูลพื้นฐานและหน้าแรก (แก้ได้ที่เมนู "หน้าแรกและข้อมูลโรงเรียน")
      schoolNameEn: '', schoolCode: '', schoolLevels: '', schoolEstablished: '', schoolMotto: SAMPLE_LANDING_CONTENT.schoolMotto,
      schoolPhilosophy: SAMPLE_LANDING_CONTENT.schoolPhilosophy, schoolIdentity: SAMPLE_LANDING_CONTENT.schoolIdentity, schoolColors: '', schoolTree: '',
      schoolVision: SAMPLE_LANDING_CONTENT.schoolVision, schoolMission: SAMPLE_LANDING_CONTENT.schoolMission, schoolGoals: SAMPLE_LANDING_CONTENT.schoolGoals,
      schoolHistory: '',
      directorMessage: '', schoolEmail: '', schoolWebsite: '', schoolFacebook: '', schoolMapUrl: '',
      coverFileId: '', directorPhotoFileId: '', gallery: [], heroSlides: [],
      // ตัวออกแบบหน้าแรก: สี/ฟอนต์, หัวข้อของแต่ละส่วน, ลำดับส่วน และข้อความตัววิ่ง
      landingStyle: {}, landingTitles: {}, landingOrder: [], tickerMessages: '',
      landingSections: { stats: true, today: true, basic: true, about: true, director: true, news: true, events: true, gallery: true, contact: true, emergency: false }
    },
    ROLE_SEEDS: [
      { key: 'admin', name: 'ผู้ดูแลระบบ' },
      { key: 'teacher', name: 'ครู' },
      { key: 'executive', name: 'ผู้บริหาร' }
    ],
    // สิทธิ์เริ่มต้นของบทบาท (ผู้ดูแลระบบได้ทุกสิทธิ์) ปรับเพิ่มภายหลังได้ที่หน้า "ผู้ใช้งานและสิทธิ์"
    ROLE_PERMISSION_SEEDS: {
      teacher: ALL_VIEW.concat(['attendance.add', 'attendance.edit', 'attendance.submit', 'porpor5.grade',
        'lessonPlan.edit', 'homeVisit.edit', 'support.edit', 'sdq.edit', 'studentInfo.edit', 'award.edit',
        'portfolio.edit', 'signature.edit', 'teachingLoad.edit', 'care.edit', 'safety.edit', 'plc.edit', 'leave.edit',
        'teachingLog.edit', 'homeroomLog.edit', 'devReport.edit', 'project.edit']),
      executive: ALL_VIEW.concat(['audit.view', 'sos.manage', 'attendance.review', 'attendance.approve', 'attendance.export',
        'supervision.edit', 'announcement.edit', 'calendar.edit', 'sar.edit', 'qa.edit', 'document.edit', 'policy.edit',
        'award.edit', 'care.edit', 'safety.edit', 'plc.edit', 'swot.edit', 'paAdmin.view', 'paAdmin.edit', 'checkinReport.view', 'leave.edit', 'leave.approve', 'safety.manage', 'concern.view', 'concern.edit', 'devReport.edit', 'review.approve', 'project.edit'])
    },
    PERMISSIONS: PERMISSIONS,
    // ธีมสำเร็จรูป 10 ชุด: [key, ชื่อ, สีหลัก (ปุ่ม/ลิงก์), สีแถบเมนู]
    THEMES: [
      ['navy', 'กรมท่า', '#1e3a5f', '#0f1b33'], ['blue', 'ฟ้าคราม', '#2563eb', '#0f172a'],
      ['emerald', 'เขียวมรกต', '#047857', '#052e25'], ['green', 'เขียวใบไม้', '#15803d', '#14281a'],
      ['purple', 'ม่วง', '#7c3aed', '#1e1238'], ['pink', 'ชมพูกุหลาบ', '#be185d', '#2a0f1d'],
      ['red', 'แดงเลือดหมู', '#b91c1c', '#2a0e0e'], ['orange', 'ส้มอิฐ', '#c2410c', '#2b150a'],
      ['gold', 'น้ำตาลทอง', '#a16207', '#231a07'], ['slate', 'เทาเข้ม', '#334155', '#111827']
    ].map(function (item) { return { key: item[0], name: item[1], primaryColor: item[2], sidebarColor: item[3] }; }),
    FOLDERS: [
      { key: 'branding', name: 'โลโก้และตราโรงเรียน' },
      { key: 'signatures', name: 'ลายเซ็น' },
      { key: 'personnel', name: 'บุคลากร' },
      { key: 'students', name: 'นักเรียน' },
      { key: 'home-visits', name: 'เยี่ยมบ้าน' },
      { key: 'supervision', name: 'นิเทศการสอน' },
      { key: 'lesson-plans', name: 'แผนการสอน' },
      { key: 'grade-reports', name: 'ปพ.5 และ ปพ.6' },
      { key: 'awards', name: 'ผลงานและรางวัล' },
      { key: 'quality', name: 'SAR และประกันคุณภาพ' },
      { key: 'policies', name: 'นโยบายและเอกสาร' },
      { key: 'exports', name: 'ไฟล์นำเข้าและส่งออก' },
      { key: 'archives', name: 'เก็บถาวรรายปีการศึกษา' },
      { key: 'care', name: 'ดูแลช่วยเหลือนักเรียน' },
      { key: 'safety', name: 'ความปลอดภัย' }
    ],
    MASTER_TABLES: {
      'titles': { sheet: 'Titles', label: 'คำนำหน้าชื่อ', kind: 'name' },
      'positions': { sheet: 'Positions', label: 'ตำแหน่ง', kind: 'name' },
      'personnel-types': { sheet: 'PersonnelTypes', label: 'ประเภทบุคลากร', kind: 'name' },
      'standings': { sheet: 'Standings', label: 'วิทยฐานะ', kind: 'name' },
      'divisions': { sheet: 'Divisions', label: 'ฝ่าย', kind: 'name' },
      'subject-groups': { sheet: 'SubjectGroups', label: 'กลุ่มสาระการเรียนรู้', kind: 'name' },
      'academic-years': { sheet: 'AcademicYears', label: 'ปีการศึกษา', kind: 'year' }
    },
    DEFAULT_MASTER_DATA: {
      'titles': ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'ดร.'],
      'positions': ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง'],
      'personnel-types': ['ข้าราชการครู', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'เจ้าหน้าที่ธุรการ'],
      'standings': ['ครูผู้ช่วย', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ครูเชี่ยวชาญ', 'ครูเชี่ยวชาญพิเศษ'],
      'divisions': ['ฝ่ายบริหารวิชาการ', 'ฝ่ายบริหารงบประมาณ', 'ฝ่ายบริหารงานบุคคล', 'ฝ่ายบริหารทั่วไป'],
      'subject-groups': ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม',
        'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ']
    }
  };
})();
