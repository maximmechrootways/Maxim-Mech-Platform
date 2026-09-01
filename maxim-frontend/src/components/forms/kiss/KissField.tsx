import React from 'react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type FieldType = 'text' | 'date' | 'number' | 'textarea' | 'checkbox'

interface KissFieldProps {
  id: string
  label: string
  type?: FieldType
  required?: boolean
  value: string | boolean
  onChange: (value: string | boolean) => void
  placeholder?: string
}

export function KissField({
  id,
  label,
  type = 'text',
  required,
  value,
  onChange,
  placeholder,
}: KissFieldProps) {
  if (type === 'textarea') {
    return (
      <Textarea
        id={id}
        label={label}
        required={required}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )
  }

  if (type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700">
        <input
          id={id}
          type="checkbox"
          className="h-5 w-5 rounded accent-brand-600"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-sm text-neutral-900 dark:text-neutral-100">{label}</span>
      </label>
    )
  }

  return (
    <Input
      id={id}
      label={label}
      type={type}
      required={required}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

