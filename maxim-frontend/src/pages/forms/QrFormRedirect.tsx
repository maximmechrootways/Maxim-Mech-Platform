import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { resolveFormQrSlug } from '@/api/formQrCodes'
import { useUser } from '@/contexts/UserContext'

export function QrFormRedirect() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setError('Missing QR code slug')
      return
    }

    let cancelled = false
    resolveFormQrSlug(slug)
      .then((data) => {
        if (cancelled) return
        if (!user) {
          localStorage.setItem('postLoginRedirectPath', data.targetPath)
          navigate('/login', { replace: true })
          return
        }
        navigate(data.targetPath, { replace: true })
      })
      .catch((e: any) => {
        if (cancelled) return
        setError(e?.response?.data?.error || 'Could not resolve QR code')
      })

    return () => {
      cancelled = true
    }
  }, [slug, navigate, user])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <p className="text-neutral-600">Resolving QR code...</p>
    </div>
  )
}

