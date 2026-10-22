"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../utils/jwt");
async function main() {
    const user = await prisma_1.prisma.user.findFirst({
        where: { role: { in: ['hr', 'owner'] }, isActive: true },
        select: { id: true, email: true, role: true },
    });
    if (!user)
        throw new Error('no hr/owner user');
    const token = (0, jwt_1.generateAccessToken)({ id: user.id, email: user.email, role: user.role });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const t0 = Date.now();
    const listRes = await fetch('http://localhost:3000/training-course-types', { headers });
    const list = (await listRes.json());
    if (!listRes.ok)
        throw new Error(`list ${listRes.status}`);
    console.log(JSON.stringify({
        listStatus: listRes.status,
        count: list.length,
        ms: Date.now() - t0,
        primary: list.filter((c) => c.isPrimary).length,
    }));
    const stamp = Date.now();
    const aRes = await fetch('http://localhost:3000/training-course-types', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `__http_A_${stamp}`, isPrimary: false }),
    });
    const a = (await aRes.json());
    const bRes = await fetch('http://localhost:3000/training-course-types', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `__http_B_${stamp}`, isPrimary: true }),
    });
    const b = (await bRes.json());
    if (!aRes.ok || !bRes.ok)
        throw new Error('create failed');
    const mRes = await fetch(`http://localhost:3000/training-course-types/${a.id}/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ intoId: b.id }),
    });
    if (!mRes.ok)
        throw new Error(`merge ${mRes.status}`);
    const dRes = await fetch(`http://localhost:3000/training-course-types/${b.id}`, {
        method: 'DELETE',
        headers,
    });
    if (!dRes.ok)
        throw new Error(`delete ${dRes.status}`);
    const ensureRes = await fetch('http://localhost:3000/training-course-types/ensure', {
        method: 'POST',
        headers,
    });
    if (!ensureRes.ok)
        throw new Error(`ensure ${ensureRes.status}`);
    const sup = await prisma_1.prisma.user.findFirst({
        where: { role: 'supervisor', isActive: true },
        select: { id: true, email: true, role: true },
    });
    if (sup) {
        const st = (0, jwt_1.generateAccessToken)({ id: sup.id, email: sup.email, role: sup.role });
        const sRes = await fetch('http://localhost:3000/training-course-types', {
            headers: { Authorization: `Bearer ${st}` },
        });
        const forbid = await fetch('http://localhost:3000/training-course-types', {
            method: 'POST',
            headers: { Authorization: `Bearer ${st}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'should-fail' }),
        });
        console.log(JSON.stringify({ supervisorRead: sRes.status, supervisorCreate: forbid.status }));
        if (sRes.status !== 200 || forbid.status !== 403)
            throw new Error('supervisor ACL failed');
    }
    console.log('HTTP API CHECKS PASSED');
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
