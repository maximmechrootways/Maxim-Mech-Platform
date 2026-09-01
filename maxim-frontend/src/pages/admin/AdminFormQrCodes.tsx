import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { createFormQrCode, listFormQrCodes, updateFormQrCode, type FormQrCode } from '@/api/formQrCodes'
import { fetchPdfTemplates } from '@/api/library'

const QUICK_TARGETS = [
  { label: 'Hazard Reporting Form', targetPath: '/safety/hazards' },
  { label: 'New Incident Report', targetPath: '/safety/incidents/new' },
  { label: 'Daily Hazard Analysis', targetPath: '/forms/daily-hazard-analysis' },
  { label: 'Start New Generic Form', targetPath: '/forms/new' },
]

export function AdminFormQrCodes() {
  const [rows, setRows] = useState<FormQrCode[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingAll, setCreatingAll] = useState(false)
  const [label, setLabel] = useState('')
  const [targetPath, setTargetPath] = useState('/forms/new')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listFormQrCodes()
      const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) =>
        String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { sensitivity: 'base' })
      )
      setRows(sorted)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load QR codes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const frontendOrigin = useMemo(
    () => (import.meta.env.VITE_QR_PUBLIC_ORIGIN || 'https://maximmech.com').replace(/\/+$/, ''),
    []
  )

  const onCreate = async () => {
    setCreating(true)
    setError(null)
    setInfo(null)
    try {
      await createFormQrCode({ label, targetPath, isActive: true })
      setLabel('')
      setTargetPath('/forms/new')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create QR code')
    } finally {
      setCreating(false)
    }
  }

  const onCreateForAllForms = async () => {
    setCreatingAll(true)
    setError(null)
    setInfo(null)
    try {
      const [existingCodes, templates] = await Promise.all([listFormQrCodes(), fetchPdfTemplates()])
      const existingTargets = new Set(
        (Array.isArray(existingCodes) ? existingCodes : []).map((code) => String(code.targetPath ?? '').trim())
      )

      const formTemplates = (Array.isArray(templates) ? templates : []).filter((tpl) => tpl?.id && tpl?.isActive !== false)
      const missing = formTemplates.filter((tpl) => !existingTargets.has(`/forms/new/${tpl.id}`))

      if (missing.length === 0) {
        setInfo('QR codes already exist for all active forms.')
        const sortedExisting = [...(Array.isArray(existingCodes) ? existingCodes : [])].sort((a, b) =>
          String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { sensitivity: 'base' })
        )
        setRows(sortedExisting)
        return
      }

      await Promise.all(
        missing.map((tpl) =>
          createFormQrCode({
            label: String(tpl.name ?? 'Form').trim() || 'Form',
            targetPath: `/forms/new/${tpl.id}`,
            isActive: true,
          })
        )
      )

      await load()
      setInfo(`Created ${missing.length} QR code${missing.length === 1 ? '' : 's'} for form templates.`)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create QR codes for all forms')
    } finally {
      setCreatingAll(false)
    }
  }

  const toggleActive = async (item: FormQrCode) => {
    try {
      const updated = await updateFormQrCode(item.id, { isActive: !item.isActive })
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update QR code')
    }
  }

  const fileSafe = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()

  const downloadQr = (item: FormQrCode, imageUrl: string) => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `${fileSafe(item.label) || 'form-qr'}-${item.slug}.png`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const printQr = (item: FormQrCode, imageUrl: string, scanUrl: string) => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=700,height=900')
    if (!popup) {
      setError('Pop-up blocked. Allow pop-ups to print QR stickers.')
      return
    }

    popup.document.open()
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Print QR - ${item.label}</title>
          <style>
            @page { size: auto; margin: 12mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .wrap { display: flex; min-height: 100vh; align-items: center; justify-content: center; }
            .sticker { border: 1px solid #d4d4d8; border-radius: 12px; padding: 12mm; max-width: 90mm; text-align: center; }
            .title { font-size: 14px; font-weight: 700; margin-bottom: 6mm; }
            .qr { width: 65mm; height: 65mm; object-fit: contain; }
            .url { margin-top: 5mm; font-size: 11px; word-break: break-all; color: #3f3f46; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="sticker">
              <div class="title">${item.label.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <img class="qr" src="${imageUrl}" alt="QR Code" />
              <div class="url">${scanUrl.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
          </div>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-neutral-900 dark:text-white">Form QR Codes</h1>
        <p className="text-neutral-500 mt-1">Create QR codes that send workers directly to a specific form screen.</p>
      </div>

      <Card padding="lg" className="space-y-3">
        <h2 className="font-semibold text-neutral-900 dark:text-white">Create QR code</h2>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCreateForAllForms} disabled={creatingAll || loading}>
            {creatingAll ? 'Generating for all forms...' : 'Generate QR for Every Form'}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Hazard Reporting - Bay 3)"
            className="min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
          />
          <input
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            placeholder="/forms/new"
            className="min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_TARGETS.map((preset) => (
            <button
              key={preset.targetPath}
              type="button"
              className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => {
                setLabel(preset.label)
                setTargetPath(preset.targetPath)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div>
          <Button onClick={onCreate} disabled={creating || !label.trim() || !targetPath.trim()}>
            {creating ? 'Creating...' : 'Create QR'}
          </Button>
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700">{info}</div>}

      <div className="space-y-3">
        {loading ? (
          <p className="text-neutral-500">Loading QR codes...</p>
        ) : rows.length === 0 ? (
          <p className="text-neutral-500">No QR codes yet.</p>
        ) : (
          rows.map((item) => {
            const scanUrl = `${frontendOrigin}/qr/${item.slug}`
            const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(scanUrl)}`
            return (
              <Card key={item.id} padding="md" className="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-white">{item.label}</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 break-all">{scanUrl}</p>
                  <p className="text-xs text-neutral-500 mt-1">Target: {item.targetPath}</p>
                  <p className="text-xs text-neutral-500">Scans: {item.scanCount}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant={item.isActive ? 'secondary' : 'primary'} onClick={() => toggleActive(item)}>
                      {item.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(scanUrl)}>
                      Copy Link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadQr(item, imageUrl)}>
                      Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => printQr(item, imageUrl, scanUrl)}>
                      Print
                    </Button>
                  </div>
                </div>
                <div className="w-40 h-40 shrink-0 rounded-lg border border-neutral-200 bg-white p-2">
                  <img src={imageUrl} alt={`QR for ${item.label}`} className="w-full h-full object-contain" />
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

