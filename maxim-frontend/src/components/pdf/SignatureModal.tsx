import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

interface SignatureModalProps {
  fieldLabel: string
  onSave: (imageData: string, signerName?: string) => void
  onClose: () => void
  /** When true, show a required "Your name" input and pass it to onSave */
  requireName?: boolean
}

export default function SignatureModal({ fieldLabel, onSave, onClose, requireName }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)
  const [signerName, setSignerName] = useState('')

  const getCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      if ('touches' in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        }
      }
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    },
    []
  )

  const startDraw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { x, y } = getCoords(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
      setDrawing(true)
      setHasStroke(true)
    },
    [getCoords]
  )

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (!drawing) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { x, y } = getCoords(e)
      ctx.lineTo(x, y)
      ctx.stroke()
    },
    [drawing, getCoords]
  )

  const endDraw = useCallback(() => setDrawing(false), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  function handleSave() {
    if (!canvasRef.current) return
    if (!hasStroke) {
      alert('Please draw your signature before saving.')
      return
    }
    if (requireName && !signerName.trim()) {
      alert('Please enter your name.')
      return
    }
    const imageData = canvasRef.current.toDataURL('image/png')
    onSave(imageData, requireName ? signerName.trim() : undefined)
  }

  function handleClear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasStroke(false)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label="Sign">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">Sign: {fieldLabel}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Draw your signature in the box below using your mouse or finger.
        </p>
        {requireName && (
          <div className="mb-4">
            <label htmlFor="signature-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Your name <span className="text-red-500">*</span>
            </label>
            <input
              id="signature-name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              autoComplete="name"
            />
          </div>
        )}
        <div className="border-2 border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-900 overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            className="w-full h-40 block cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
          <button
            type="button"
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            onClick={handleClear}
          >
            Clear
          </button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save signature
          </Button>
        </div>
      </div>
    </div>
  )
}
