import { useState } from 'react'
import type { DesktopConfig } from '../api'

export function SetupScreen({
  initial,
  onSaved,
}: {
  initial: DesktopConfig | null
  onSaved: (cfg: DesktopConfig) => void
}) {
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl || 'http://192.168.1.198:8080')
  const [apiKey, setApiKey] = useState(initial?.apiKey || '')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const cfg = await window.maximDesktop.setConfig({ apiUrl: apiUrl.trim().replace(/\/$/, ''), apiKey: apiKey.trim() })
      const res = await fetch(`${cfg.apiUrl}/health`)
      if (!res.ok) throw new Error('GX10 health check failed')
      onSaved(cfg)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not reach GX10')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <div className="hero">
        <h1>Connect to the GX10</h1>
        <p>One-time setup. Use the same API key as the GX10 <code>.env</code> (<code>GX10_API_KEY</code>).</p>
      </div>
      <label className="field">
        GX10 URL (LAN)
        <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
      </label>
      <label className="field">
        API key
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <button type="button" className="cta" disabled={saving || !apiKey.trim()} onClick={() => void save()}>
        {saving ? 'Checking…' : 'Save & continue'}
      </button>
      {msg && <p className="warn">{msg}</p>}
    </div>
  )
}
