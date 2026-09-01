import { Router } from 'express'
import { authenticate } from '../middleware/authenticate'
import * as productFeedbackService from '../services/productFeedbackService'

const router = Router()
router.use(authenticate)

router.post('/', async (req, res, next) => {
  try {
    const item = await productFeedbackService.submitProductFeedback({
      userId: req.user!.id,
      userRole: req.user!.role,
      message: req.body?.message,
      pageUrl: req.body?.pageUrl,
    })
    res.status(201).json(item)
  } catch (e) {
    next(e)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const list = await productFeedbackService.listProductFeedback(req.user!.role)
    res.json(list)
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const item = await productFeedbackService.updateProductFeedback(
      req.user!.role,
      req.params.id,
      {
        message: req.body?.message,
        completed: req.body?.completed,
      }
    )
    res.json(item)
  } catch (e) {
    next(e)
  }
})

router.post('/:id/retry-forward', async (req, res, next) => {
  try {
    const item = await productFeedbackService.retryProductFeedbackForward(req.user!.role, req.params.id)
    res.json(item)
  } catch (e) {
    next(e)
  }
})

router.post('/:id/comments', async (req, res, next) => {
  try {
    const comment = await productFeedbackService.addProductFeedbackComment({
      viewerRole: req.user!.role,
      feedbackId: req.params.id,
      authorId: req.user!.id,
      body: req.body?.body,
    })
    res.status(201).json(comment)
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await productFeedbackService.deleteProductFeedback(req.user!.role, req.params.id)
    res.json(result)
  } catch (e) {
    next(e)
  }
})

export default router
