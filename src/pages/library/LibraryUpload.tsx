import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/contexts/UserContext'
import { useScannedPdfs } from '@/contexts/ScannedPdfsContext'

export function LibraryUpload() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { addPdf } = useScannedPdfs()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isOwnerOrHr = user?.role === 'owner' || user?.role === 'hr'
  if (!isOwnerOrHr) {
    navigate('/library', { replace: true })
    return null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setSelectedFile(file ?? null)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file?.type === 'application/pdf') setSelectedFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleUpload = () => {
    const id = `pdf-${Date.now()}`
    const name = selectedFile?.name ?? `Uploaded form ${new Date().toLocaleDateString()}.pdf`
    addPdf({
      id,
      name,
      uploadedAt: new Date().toISOString().slice(0, 19) + 'Z',
      uploadedBy: user?.name ?? 'HR',
    })
    navigate(`/library/template/${id}/edit`, { replace: true })
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/library?view=templates')} className="no-print -ml-2">
          ← Back
        </Button>
      </div>
      <Card padding="lg">
        <CardHeader>Upload PDF</CardHeader>
        <CardDescription>
          Upload a PDF form (e.g. safety checklist, inspection sheet). You will then place fillable fields (text, date, signature) on the document and assign the form to roles or specific people. Once assigned, when they fill and sign it becomes a submission.
        </CardDescription>
        <div className="mt-6 flex flex-col items-start gap-4">
          <input
            ref={fileInputRef}
            id="library-upload-pdf"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Choose PDF file"
          />
          <label
            htmlFor="library-upload-pdf"
            className="w-full min-h-[200px] rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center gap-2 bg-neutral-50/50 dark:bg-neutral-800/30 cursor-pointer hover:border-brand-500/50 hover:bg-brand-50/20 dark:hover:bg-brand-900/10 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Drop your PDF here or click to browse</p>
            <span className="px-3 py-1.5 text-sm font-medium rounded-xl border-2 border-brand-500/80 text-brand-600 dark:text-brand-400 bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/50 pointer-events-none">
              Select PDF
            </span>
            {selectedFile && (
              <p className="text-sm font-medium text-brand-600 dark:text-brand-400 mt-1">{selectedFile.name}</p>
            )}
          </label>
          <Button onClick={handleUpload}>{selectedFile ? 'Continue to add fields' : 'Continue without file (demo)'}</Button>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            After upload you will add fields on the document (DocuSign-style), set schedule and assignment, then save. The form becomes a template others can fill and sign.
          </p>
        </div>
      </Card>
    </div>
  )
}
