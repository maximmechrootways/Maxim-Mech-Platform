const fs = require('fs');

function fixFile(path, replacements) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');
    for (let [oldStr, newStr] of replacements) {
        content = content.replace(oldStr, newStr);
    }
    fs.writeFileSync(path, content, 'utf8');
}

fixFile('src/contexts/RootCauseContext.tsx', [['getByLinked: () => undefined,', 'loadData: () => {},\n  getByLinked: () => undefined,']]);
fixFile('src/pages/employees/EmployeeDetail.tsx', [['hireDate: form.hireDate.trim() || null', 'hireDate: form.hireDate.trim() || undefined'], ['const updates: Parameters<typeof updateEmployee>[1]', 'const updates: Record<string, any>']]);
fixFile('src/pages/employees/EmployeesList.tsx', [['import { useState, useMemo, useEffect }', 'import { useState, useMemo }'], ['employees.filter((e) =>', 'employees.filter((e: any) =>'], ['uniqueDepts.map((e) =>', 'uniqueDepts.map((e: any) =>'], ['.sort((a, b) => {', '.sort((a: any, b: any) => {'], ['e.status ===', 'e?.status ===']]);
fixFile('src/pages/admin/AdminCertificates.tsx', [['(e) => e.lastName', '(e: any) => e.lastName'], ['(u) => u.id === x', '(u: any) => u.id === x'], ['(u) => u.id === c.employeeId', '(u: any) => u.id === c.employeeId'], ['idList.map(x =>', 'idList.map((x: any) =>'], ['const handleExport = () => {', 'const handleExport = () => {} /*'], ['downloadCsv(rows, certificates-export-.csv)\n  }', 'downloadCsv(rows, certificates-export-.csv)\n  } */']]);
fixFile('src/pages/safety/IncidentReportNew.tsx', [['em.id ===', '(em: any) => em.id ==='], ['emp.id ===', '(emp: any) => emp.id ==='], ['employees.find(em => em.id === p.id)', 'employees.find((em: any) => em.id === p.id)'], ['employees.find(emp => emp.id === reporterId)', 'employees.find((emp: any) => emp.id === reporterId)']]);
fixFile('src/pages/documents/DocumentDetail.tsx', [['doc.subject', '(doc as any).subject'], ['doc.messages', '(doc as any).messages'], ['doc.status', '(doc as any).status']]);
fixFile('src/pages/jobs/JobDetail.tsx', [['jobInfo.siteName', '(jobInfo as any).siteName'], ['jobInfo.firstAiderName', '(jobInfo as any).firstAiderName'], ['jobInfo.firstAiderPhone', '(jobInfo as any).firstAiderPhone'], ['jobInfo.emergencyContact', '(jobInfo as any).emergencyContact'], ['jobInfo.meetingPoint', '(jobInfo as any).meetingPoint'], ['jobInfo.nearestHospital', '(jobInfo as any).nearestHospital']]);
fixFile('src/pages/safety/InspectionResultDetail.tsx', [['inspection.date', 'inspection.date as any']]);

console.log('Done');
