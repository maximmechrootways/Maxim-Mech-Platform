import { Navigate } from 'react-router-dom'

/** @deprecated Register UI lives on Hazard Review hub; keep route for bookmarks. */
export function HazardRiskRegister() {
  return <Navigate to="/hazard-review" replace />
}
