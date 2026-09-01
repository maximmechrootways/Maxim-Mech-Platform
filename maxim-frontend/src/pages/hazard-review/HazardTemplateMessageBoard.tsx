import { Navigate, useParams } from 'react-router-dom'
import {
  getStaticHazardReviewDocument,
  looksLikeHazardCustomTemplateKey,
} from '@/pages/hazard-review/hazardReviewDocuments'

/** Old URL: redirects to assessment page with hash so the message section scrolls into view. */
export function HazardTemplateMessageBoard() {
  const { templateKey = '' } = useParams<{ templateKey: string }>()
  if (!templateKey) {
    return <Navigate to="/hazard-review" replace />
  }
  const okStatic = !!getStaticHazardReviewDocument(templateKey)
  const okCustom = looksLikeHazardCustomTemplateKey(templateKey)
  if (!okStatic && !okCustom) {
    return <Navigate to="/hazard-review" replace />
  }
  return <Navigate to={`/hazard-review/assess/${templateKey}#messages`} replace />
}
