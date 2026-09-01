import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as hrTodoService from '../services/hrTodoService'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
    try {
        const list = await hrTodoService.listTodo(req.user!.id, req.user!.role, {
            dueDate: req.query.dueDate as string,
            completed: req.query.completed as string,
        })
        res.json(list)
    } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
    try {
        const item = await hrTodoService.createTodo(req.user!.id, req.user!.role, req.body)
        res.status(201).json(item)
    } catch (e) { next(e) }
})

router.patch('/:id', async (req, res, next) => {
    try {
        const item = await hrTodoService.updateTodo(req.params.id, req.user!.id, req.user!.role, req.body)
        res.json(item)
    } catch (e) { next(e) }
})

router.delete('/:id', async (req, res, next) => {
    try {
        await hrTodoService.deleteTodo(req.params.id, req.user!.id, req.user!.role)
        res.json({ message: 'Deleted' })
    } catch (e) { next(e) }
})

export default router
