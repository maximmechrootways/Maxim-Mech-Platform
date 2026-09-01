import { prisma } from '../lib/prisma'

const ROLES = ['owner', 'hr']

function canAccess(role: string) {
    if (!ROLES.includes(role)) throw { status: 403, message: 'Only Owner or HR can manage HR Todo' }
}

function map(r: any) {
    return {
        id: r.id,
        title: r.title,
        recurrence: r.recurrence,
        dueDate: r.dueDate,
        dueTime: r.dueTime ?? undefined,
        completed: r.completed,
        completedAt: r.completedAt?.toISOString?.() ?? undefined,
        linkTo: r.linkTo ?? undefined,
        createdAt: r.createdAt?.toISOString?.() ?? undefined,
    }
}

export async function listTodo(userId: string, role: string, query: { dueDate?: string; completed?: string }) {
    canAccess(role)
    const where: any = { userId }
    if (query.dueDate) where.dueDate = query.dueDate
    if (query.completed === 'true') where.completed = true
    if (query.completed === 'false') where.completed = false
    const list = await prisma.hRTodoItem.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { dueTime: 'asc' }],
    })
    return list.map(map)
}

export async function createTodo(userId: string, role: string, data: any) {
    canAccess(role)
    // assignToUserId: when set, the todo is for that user (Frank/HR assigning reminder to someone else)
    const assigneeUserId = data.assignToUserId?.trim() || userId
    const r = await prisma.hRTodoItem.create({
        data: {
            userId: assigneeUserId,
            title: (data.title || '').trim(),
            recurrence: data.recurrence || 'daily',
            dueDate: (data.dueDate || '').trim(),
            dueTime: data.dueTime?.trim() || null,
            linkTo: data.linkTo?.trim() || null,
        },
    })
    return map(r)
}

export async function updateTodo(id: string, userId: string, role: string, data: any) {
    canAccess(role)
    const existing = await prisma.hRTodoItem.findFirst({ where: { id, userId } })
    if (!existing) throw { status: 404, message: 'Todo not found' }
    const r = await prisma.hRTodoItem.update({
        where: { id },
        data: {
            ...(data.title !== undefined && { title: data.title.trim() }),
            ...(data.recurrence !== undefined && { recurrence: data.recurrence }),
            ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
            ...(data.dueTime !== undefined && { dueTime: data.dueTime?.trim() || null }),
            ...(data.completed !== undefined && { completed: data.completed, completedAt: data.completed ? new Date() : null }),
            ...(data.linkTo !== undefined && { linkTo: data.linkTo?.trim() || null }),
        },
    })
    return map(r)
}

export async function deleteTodo(id: string, userId: string, role: string) {
    canAccess(role)
    const existing = await prisma.hRTodoItem.findFirst({ where: { id, userId } })
    if (!existing) throw { status: 404, message: 'Todo not found' }
    await prisma.hRTodoItem.delete({ where: { id } })
    return { message: 'Deleted' }
}
