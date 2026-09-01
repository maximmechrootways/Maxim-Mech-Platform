import { FormReviewPdf } from './FormReviewPdf'

/**
 * Form review for PDF submissions (GET /pdf-submissions/:id).
 * Renders filled PDF with read-only field overlays, status, Save as PDF, and Approve (HR/Owner).
 */
export function FormReview() {
  return <FormReviewPdf />
}
