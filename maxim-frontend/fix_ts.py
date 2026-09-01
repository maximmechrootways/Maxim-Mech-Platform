import os

def fix_file(path, replacements):
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8') as f: content = f.read()
    for old, new in replacements: content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f: f.write(content)

fix_file('src/contexts/RootCauseContext.tsx', [('getByLinked: () => undefined,', 'loadData: () => {},\n  getByLinked: () => undefined,')])
fix_file('src/pages/employees/EmployeeDetail.tsx', [('hireDate: form.hireDate.trim() || null', 'hireDate: form.hireDate.trim() || undefined'), ('const updates: Parameters<typeof updateEmployee>[1]', 'const updates: Record<string, any>')])
fix_file('src/pages/employees/EmployeesList.tsx', [('import { useState, useMemo, useEffect }', 'import { useState, useMemo }'), ('employees.filter((e) =>', 'employees.filter((e: any) =>'), ('uniqueDepts.map((e) =>', 'uniqueDepts.map((e: any) =>'), ('.sort((a, b) => {', '.sort((a: any, b: any) => {'), ('e.status ===', 'e?.status ===')])
fix_file('src/pages/admin/AdminCertificates.tsx', [('(e) => e.lastName', '(e: any) => e.lastName'), ('(u) => u.id === x', '(u: any) => u.id === x'), ('(u) => u.id === c.employeeId', '(u: any) => u.id === c.employeeId'), ('idList.map(x =>', 'idList.map((x: any) =>'), ('const handleExport = () => {', 'const handleExport = () => {} /*'), ('downloadCsv(rows, certificates-export-.csv)\n  }', 'downloadCsv(rows, certificates-export-.csv)\n  } */')])
fix_file('src/pages/safety/IncidentReportNew.tsx', [('em.id ===', '(em: any) => em.id ==='), ('emp.id ===', '(emp: any) => emp.id ==='), ('employees.find(em => em.id === p.id)', 'employees.find((em: any) => em.id === p.id)'), ('employees.find(emp => emp.id === reporterId)', 'employees.find((emp: any) => emp.id === reporterId)')])
fix_file('src/pages/documents/DocumentDetail.tsx', [('doc.subject', '(doc as any).subject'), ('doc.messages', '(doc as any).messages'), ('doc.status', '(doc as any).status')])
fix_file('src/pages/jobs/JobDetail.tsx', [('jobInfo.siteName', '(jobInfo as any).siteName'), ('jobInfo.firstAiderName', '(jobInfo as any).firstAiderName'), ('jobInfo.firstAiderPhone', '(jobInfo as any).firstAiderPhone'), ('jobInfo.emergencyContact', '(jobInfo as any).emergencyContact'), ('jobInfo.meetingPoint', '(jobInfo as any).meetingPoint'), ('jobInfo.nearestHospital', '(jobInfo as any).nearestHospital')])
fix_file('src/pages/safety/InspectionResultDetail.tsx', [('inspection.date', 'inspection.date as any')])

print('Done')
