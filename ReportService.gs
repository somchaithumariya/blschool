/**
 * รายงานสรุป: สารสนเทศ, ผลงานและรางวัล, ข้อมูลพื้นฐานโรงเรียน/ครู, SAR และบันทึกการใช้งาน
 */
var ReportService = (function () {
  'use strict';

  function byYear(sheet, academicYearId) {
    return SheetRepository.all(sheet).filter(function (row) { return String(row.academicYearId) === String(academicYearId); });
  }

  function countBy(rows, key) {
    return rows.reduce(function (counts, row) {
      var value = row[key] === '' || row[key] === undefined ? 'ไม่ระบุ' : row[key];
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  // ความครบถ้วนของข้อมูลนักเรียนรายห้อง
  function information(token, data) {
    AuthService.requirePermission(token, 'studentInfo.view');
    var yearId = data && data.academicYearId;
    var enrollments = byYear('StudentEnrollments', yearId).filter(function (row) { return row.status !== 'ย้ายออก'; });
    function studentSet(sheet) {
      return byYear(sheet, yearId).reduce(function (set, row) { set[row.studentId] = true; return set; }, {});
    }
    var info = studentSet('StudentInformation');
    var visits = studentSet('HomeVisits');
    var sdq = studentSet('SdqAssessments');
    var support = byYear('SupportCases', yearId);
    var homerooms = byYear('Homerooms', yearId);
    return { rows: homerooms.map(function (homeroom) {
      var students = enrollments.filter(function (row) { return String(row.homeroomId) === String(homeroom.id); });
      function count(set) { return students.filter(function (row) { return set[row.studentId]; }).length; }
      var studentIds = students.map(function (row) { return String(row.studentId); });
      var cases = support.filter(function (row) { return studentIds.indexOf(String(row.studentId)) !== -1; });
      return { homeroomId: homeroom.id, label: homeroom.gradeLevel + '/' + homeroom.roomName, students: students.length,
        info: count(info), visits: count(visits), sdq: count(sdq),
        risk: cases.filter(function (row) { return row.group === 'เสี่ยง'; }).length,
        problem: cases.filter(function (row) { return row.group === 'มีปัญหา'; }).length };
    }).sort(function (a, b) { return a.label.localeCompare(b.label, 'th', { numeric: true }); }) };
  }

  function awards(token, data) {
    AuthService.requirePermission(token, 'award.view');
    var rows = byYear('Awards', data && data.academicYearId);
    var matrix = {};
    rows.forEach(function (row) {
      var type = row.ownerType || 'ไม่ระบุ';
      var level = row.level || 'ไม่ระบุ';
      matrix[type] = matrix[type] || {};
      matrix[type][level] = (matrix[type][level] || 0) + 1;
    });
    return { total: rows.length, matrix: matrix, rows: rows.sort(function (a, b) { return String(b.awardDate).localeCompare(String(a.awardDate)); }) };
  }

  function schoolBasic(token, data) {
    AuthService.requirePermission(token, 'sar.view');
    var yearId = data && data.academicYearId;
    var students = EntityService.indexBy(SheetRepository.all('Students'));
    var homerooms = EntityService.indexBy(byYear('Homerooms', yearId));
    var grades = {};
    byYear('StudentEnrollments', yearId).filter(function (row) { return row.status !== 'ย้ายออก'; }).forEach(function (row) {
      var homeroom = homerooms[row.homeroomId];
      if (!homeroom) return;
      var grade = grades[homeroom.gradeLevel] = grades[homeroom.gradeLevel] || { male: 0, female: 0, rooms: {} };
      var gender = (students[row.studentId] || {}).gender;
      if (gender === 'ชาย') grade.male += 1; else if (gender === 'หญิง') grade.female += 1;
      grade.rooms[homeroom.id] = true;
    });
    var levels = APP_CONFIG.GRADE_LEVELS.filter(function (level) { return grades[level]; }).map(function (level) {
      return { gradeLevel: level, rooms: Object.keys(grades[level].rooms).length, male: grades[level].male, female: grades[level].female };
    });
    var personnel = SheetRepository.all('Personnel');
    var types = EntityService.indexBy(SheetRepository.all('PersonnelTypes'));
    var byType = {};
    personnel.forEach(function (row) {
      var name = types[row.personnelTypeId] ? types[row.personnelTypeId].name : 'ไม่ระบุ';
      byType[name] = (byType[name] || 0) + 1;
    });
    return { settings: SettingsService.getPublicSettings(), levels: levels, personnelByType: byType, personnelTotal: personnel.length };
  }

  function teacherBasic(token) {
    AuthService.requirePermission(token, 'sar.view');
    var personnel = SheetRepository.all('Personnel');
    function named(sheet, key) {
      var index = EntityService.indexBy(SheetRepository.all(sheet));
      return personnel.reduce(function (counts, row) {
        var name = index[row[key]] ? index[row[key]].name : 'ไม่ระบุ';
        counts[name] = (counts[name] || 0) + 1;
        return counts;
      }, {});
    }
    return { total: personnel.length, byStanding: named('Standings', 'standingId'), bySubjectGroup: named('SubjectGroups', 'subjectGroupId'),
      byPosition: named('Positions', 'positionId'), byType: named('PersonnelTypes', 'personnelTypeId') };
  }

  function sar(token, data) {
    AuthService.requirePermission(token, 'sar.view');
    var yearId = data && data.academicYearId;
    return {
      basic: schoolBasic(token, data),
      sections: byYear('SarSections', yearId).sort(function (a, b) { return Number(a.sectionNo) - Number(b.sectionNo); }),
      indicators: byYear('QaIndicators', yearId),
      awards: countBy(byYear('Awards', yearId), 'level')
    };
  }

  function auditLogs(token, data) {
    AuthService.requirePermission(token, 'audit.view');
    var users = EntityService.indexBy(SheetRepository.all('Users', { includeDeleted: true }));
    var query = String((data && data.query) || '').trim().toLowerCase();
    return { rows: SheetRepository.readLastRows('AuditLogs', 500).filter(function (row) {
      return !query || [row.action, row.entityType].join(' ').toLowerCase().indexOf(query) !== -1;
    }).map(function (row) {
      var user = users[row.createdBy];
      return { createdAt: row.createdAt, action: row.action, entityType: row.entityType, entityId: row.entityId,
        user: user ? user.displayName || user.username : row.createdBy };
    }) };
  }

  return { information: information, awards: awards, schoolBasic: schoolBasic, teacherBasic: teacherBasic, sar: sar,
    auditLogs: auditLogs, countBy: countBy };
})();
