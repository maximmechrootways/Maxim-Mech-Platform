import { useEffect, useRef, useCallback, type ClipboardEvent, type KeyboardEvent } from 'react'

type OtpCodeInputProps = {
  value: string
  onChange: (code: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  'aria-label'?: string
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
  'aria-label': ariaLabel = 'Authenticator code',
}: OtpCodeInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const digits = onlyDigits(value).slice(0, length).padEnd(length, ' ').split('').map((c) => (c === ' ' ? '' : c))

  useEffect(() => {
    if (!autoFocus || disabled) return
    const id = window.requestAnimationFrame(() => {
      inputsRef.current[0]?.focus()
      inputsRef.current[0]?.select()
    })
    return () => window.cancelAnimationFrame(id)
  }, [autoFocus, disabled])

  const setDigits = useCallback(
    (next: string[]) => {
      onChange(next.join('').slice(0, length))
    },
    [length, onChange],
  )

  const focusAt = (index: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(length - 1, index))]
    el?.focus()
    el?.select()
  }

  const handleChange = (index: number, raw: string) => {
    const cleaned = onlyDigits(raw)
    if (!cleaned) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }

    // Paste or multi-digit into one box
    if (cleaned.length > 1) {
      const next = [...digits]
      for (let i = 0; i < cleaned.length && index + i < length; i++) {
        next[index + i] = cleaned[i]
      }
      setDigits(next)
      focusAt(Math.min(length - 1, index + cleaned.length))
      return
    }

    const next = [...digits]
    next[index] = cleaned
    setDigits(next)
    if (index < length - 1) focusAt(index + 1)
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...digits]
      if (next[index]) {
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        next[index - 1] = ''
        setDigits(next)
        focusAt(index - 1)
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusAt(index - 1)
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusAt(index + 1)
      return
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = onlyDigits(e.clipboardData.getData('text')).slice(0, length)
    if (!pasted) return
    const next = Array.from({ length }, (_, i) => pasted[i] || '')
    setDigits(next)
    focusAt(Math.min(length - 1, pasted.length))
  }

  return (
    <div className="space-y-2" role="group" aria-label={ariaLabel}>
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{ariaLabel}</p>
      <div className="flex justify-between gap-2 sm:gap-2.5">
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={length}
            disabled={disabled}
            value={digits[index]}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className="w-10 h-12 sm:w-11 sm:h-12 text-center text-lg font-mono font-semibold rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
          />
        ))}
      </div>
    </div>
  )
}
