"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Smoke test for TrainingCourseType catalog — create/rename/merge/delete + cert rewrite.
 * Run: npx ts-node --transpile-only src/scripts/smokeTrainingCourseCatalog.ts
 */
const prisma_1 = require("../lib/prisma");
const trainingCourseTypeService_1 = require("../services/trainingCourseTypeService");
function assert(cond, msg) {
    if (!cond)
        throw new Error(`ASSERT: ${msg}`);
}
async function main() {
    console.log('1) Table exists?');
    const tableCheck = await prisma_1.prisma.$queryRawUnsafe(`SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'TrainingCourseType'
    ) AS exists`);
    assert(tableCheck[0]?.exists, 'TrainingCourseType table missing — migrate not applied');
    console.log('   OK');
    console.log('2) Seed / ensure catalog');
    await (0, trainingCourseTypeService_1.ensureTrainingCourseCatalog)();
    let list = await (0, trainingCourseTypeService_1.listTrainingCourseTypes)({ includeInactive: true });
    const primaryNames = list.filter((c) => c.isPrimary).map((c) => c.name);
    for (const expected of trainingCourseTypeService_1.DEFAULT_PRIMARY_TRAINING_COURSES) {
        assert(primaryNames.some((n) => n.toLowerCase() === expected.toLowerCase()), `Missing primary seed: ${expected}`);
    }
    console.log(`   OK — ${list.length} courses (${primaryNames.length} primary)`);
    console.log('3) Create duplicate-style courses for merge test');
    const stamp = Date.now();
    const a = await (0, trainingCourseTypeService_1.createTrainingCourseType)({
        name: `__smoke_AWP_variant_${stamp}`,
        isPrimary: false,
    });
    const b = await (0, trainingCourseTypeService_1.createTrainingCourseType)({
        name: `__smoke_AWP_canonical_${stamp}`,
        isPrimary: true,
    });
    console.log(`   OK — created ${a.id} and ${b.id}`);
    console.log('4) Create certificate using variant name, then merge');
    const uploader = await prisma_1.prisma.user.findFirst({
        where: { role: { in: ['owner', 'hr'] }, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
    });
    assert(uploader, 'Need an owner/hr user for cert create');
    const holder = await prisma_1.prisma.user.findFirst({
        where: { isActive: true, employmentStatus: { not: 'terminated' } },
        select: { id: true, firstName: true, lastName: true },
    });
    assert(holder, 'Need an employee holder');
    const cert = await prisma_1.prisma.certificate.create({
        data: {
            name: a.name,
            holderName: `${holder.firstName} ${holder.lastName}`.trim(),
            holderUserId: holder.id,
            expirationDate: '2099-12-31',
            uploadedById: uploader.id,
            uploadedBy: `${uploader.firstName || ''} ${uploader.lastName || ''}`.trim() || uploader.email,
        },
    });
    console.log(`   OK — cert ${cert.id} named "${cert.name}"`);
    const merge = await (0, trainingCourseTypeService_1.mergeTrainingCourseType)({ fromId: a.id, intoId: b.id });
    assert(merge.certificatesUpdated >= 1, `Expected cert rewrite, got ${merge.certificatesUpdated}`);
    const certAfter = await prisma_1.prisma.certificate.findUnique({ where: { id: cert.id } });
    assert(certAfter?.name === b.name, `Cert name should be ${b.name}, got ${certAfter?.name}`);
    const aGone = await prisma_1.prisma.trainingCourseType.findUnique({ where: { id: a.id } });
    assert(!aGone, 'Source course should be deleted after merge');
    console.log(`   OK — merge rewrote ${merge.certificatesUpdated} cert(s), source removed`);
    console.log('5) Rename updates certificates');
    const renamedTo = `__smoke_renamed_${stamp}`;
    const renamed = await (0, trainingCourseTypeService_1.updateTrainingCourseType)(b.id, { name: renamedTo });
    assert((renamed.certificatesUpdated ?? 0) >= 1, 'Rename should update certs');
    const certRenamed = await prisma_1.prisma.certificate.findUnique({ where: { id: cert.id } });
    assert(certRenamed?.name === renamedTo, `Cert should be ${renamedTo}`);
    console.log('   OK');
    console.log('6) Delete with mergeInto when in use');
    const c = await (0, trainingCourseTypeService_1.createTrainingCourseType)({ name: `__smoke_delete_target_${stamp}`, isPrimary: false });
    const del = await (0, trainingCourseTypeService_1.deleteTrainingCourseType)(b.id, { mergeIntoId: c.id });
    assert(del.deleted, 'delete failed');
    const certFinal = await prisma_1.prisma.certificate.findUnique({ where: { id: cert.id } });
    assert(certFinal?.name === c.name, `Cert should be ${c.name} after delete-merge`);
    console.log('   OK');
    console.log('7) Cleanup smoke artifacts');
    await prisma_1.prisma.certificate.delete({ where: { id: cert.id } });
    await (0, trainingCourseTypeService_1.deleteTrainingCourseType)(c.id);
    // remove any leftover smoke rows
    await prisma_1.prisma.trainingCourseType.deleteMany({
        where: { name: { startsWith: '__smoke_' } },
    });
    console.log('   OK');
    list = await (0, trainingCourseTypeService_1.listTrainingCourseTypes)();
    console.log(`\nALL SMOKE CHECKS PASSED — catalog has ${list.length} active courses`);
}
main()
    .catch((e) => {
    console.error('\nSMOKE FAILED:', e);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
