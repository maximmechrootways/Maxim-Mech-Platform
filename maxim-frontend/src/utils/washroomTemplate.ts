/** Names / presets for site-specific washroom PDF templates (see backend seed). */

export function isWashroomInspectionStyleTemplateName(name?: string | null): boolean {
  const n = String(name ?? '').trim().toLowerCase()
  if (!n) return false
  if (n.includes('washroom inspection checklist')) return true
  if (n.includes('peter washroom')) return true
  if (n.includes('shop washroom')) return true
  if (n.includes('main office washroom')) return true
  return false
}

export type WashroomSitePresetKind = 'peter_or_shop' | 'main_office'

/** Plain label for the washroom location dropdown (must match seed `[DROPDOWN]` question text). */
export const WASHROOM_LOCATION_DROPDOWN_LABEL = 'Washroom location'

/** Preset kind from the location dropdown value. */
export function getWashroomSitePresetFromLocationSelection(selected: string): WashroomSitePresetKind | null {
  const s = String(selected ?? '').trim().toLowerCase()
  if (!s) return null
  if (s === 'main office washroom') return 'main_office'
  if (s === 'peter washroom' || s === 'shop washroom') return 'peter_or_shop'
  return null
}

/**
 * Legacy: separate PDF templates named after a site (before the location dropdown existed).
 * The main "Washroom Inspection Checklist" template uses the dropdown instead.
 */
export function getWashroomSiteTemplatePreset(name?: string | null): WashroomSitePresetKind | null {
  const n = String(name ?? '').trim().toLowerCase()
  if (n.includes('main office washroom')) return 'main_office'
  if (n.includes('peter washroom') || n.includes('shop washroom')) return 'peter_or_shop'
  return null
}

export const WASHROOM_ESCALATION_DEFAULT_TEXT = 'Washroom clean, fully stocked and ready to use'

/** Hide washroom inspection drafts from dashboard "My Drafts" (they use quick site presets, not long-lived drafts). */
export function isWashroomDraftForMyDraftsList(templateName?: string | null): boolean {
  return isWashroomInspectionStyleTemplateName(templateName)
}
