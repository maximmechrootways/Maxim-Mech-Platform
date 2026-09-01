import { api, apiPath, getAuthToken } from '@/api'
import axios from 'axios'

async function readBlobErrorMessage(blob: Blob): Promise<string | null> {
  try {
    const payload = JSON.parse(await blob.text()) as { error?: string; message?: string }
    return payload.error || payload.message || null
  } catch {
    return null
  }
}

async function assertAttachmentBlob(blob: Blob): Promise<Blob> {
  const headerBytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const isPdf = headerBytes.length >= 5
    && String.fromCharCode(...headerBytes.slice(0, 5)) === '%PDF-'
  const isPng = headerBytes.length >= 8
    && headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4E && headerBytes[3] === 0x47
  const isJpg = headerBytes.length >= 3
    && headerBytes[0] === 0xFF && headerBytes[1] === 0xD8 && headerBytes[2] === 0xFF
  if (isPdf || isPng || isJpg) return blob
  const message = await readBlobErrorMessage(blob)
  throw new Error(message || 'Could not load attachment')
}

/** @deprecated Use assertAttachmentBlob */
async function assertPdfBlob(blob: Blob): Promise<Blob> {
  return assertAttachmentBlob(blob)
}

async function rethrowAxiosBlobError(e: unknown): Promise<never> {
  if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
    const message = await readBlobErrorMessage(e.response.data)
    if (message) throw new Error(message)
    if (e.response.status === 401) throw new Error('Your session expired. Please sign in again.')
  }
  throw e
}

export type IncomingFinanceDocumentType = 'INVOICE' | 'RECEIPT' | 'STATEMENT'

export type IncomingInvoiceListRow = {
  id: string
  documentType: IncomingFinanceDocumentType | string
  emailSubject: string | null
  emailFrom: string | null
  receivedAt: string | null
  vendorName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  totalAmount: string | null
  currency: string | null
  poNumber: string | null
  jobReference: string | null
  jobId: string | null
  jobTitle: string | null
  paidAt: string | null
  reviewedAt: string | null
  reviewedById: string | null
  reviewedByName: string | null
  relatedInvoiceId: string | null
  notes: string | null
  status: string
  attachmentCount: number
  attachments: Array<{ id: string; originalName: string }>
}

export type IncomingInvoiceDetail = {
  id: string
  gmailMessageId: string
  documentType: IncomingFinanceDocumentType | string
  sourceSequence: number
  relatedInvoiceId: string | null
  emailSubject: string | null
  emailBodyText: string | null
  emailBodyHtml: string | null
  emailFrom: string | null
  emailTo: string | null
  receivedAt: string | null
  status: string
  vendorName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  subtotal: string | null
  taxAmount: string | null
  totalAmount: string | null
  currency: string | null
  poNumber: string | null
  jobReference: string | null
  jobId: string | null
  paidAt: string | null
  reviewedAt: string | null
  reviewedById: string | null
  reviewedByName: string | null
  paymentTerms: string | null
  notes: string | null
  extractedData: unknown
  processedAt: string | null
  attachments: Array<{
    id: string
    attachmentIndex: number
    originalName: string
    mimeType: string | null
    sizeBytes: number | null
    ocrText: string | null
  }>
}

export async function fetchIncomingInvoicesSummary(): Promise<{
  total: number
  thisMonth: number
  failedJobs: number
}> {
  const { data } = await api.get('/incoming-invoices/summary')
  return data
}

export async function fetchIncomingInvoices(params?: {
  q?: string
  vendor?: string
  dateFrom?: string
  dateTo?: string
  minTotal?: number
  maxTotal?: number
  status?: string
  documentType?: string
  paid?: string
  reviewed?: string
  sort?: string
  limit?: number
  offset?: number
}): Promise<{ rows: IncomingInvoiceListRow[]; total: number }> {
  const { data, headers } = await api.get<{ rows: IncomingInvoiceListRow[]; total: number }>(
    '/incoming-invoices',
    { params }
  )
  const headerTotal = Number(headers['x-total-count'])
  return {
    rows: data.rows ?? [],
    total: Number.isFinite(headerTotal) ? headerTotal : data.total ?? 0,
  }
}

export async function fetchIncomingInvoiceDetail(id: string): Promise<IncomingInvoiceDetail> {
  const { data } = await api.get<IncomingInvoiceDetail>(`/incoming-invoices/${encodeURIComponent(id)}`)
  return data
}

export async function fetchIncomingInvoiceAttachmentUrl(
  invoiceId: string,
  attachmentId: string
): Promise<{ url: string; originalName: string }> {
  const { data } = await api.get<{ url: string; originalName: string }>(
    `/incoming-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}/download`
  )
  return data
}

/** Authenticated file URL for iframe / window.open (iframes cannot send Authorization headers). */
export function getIncomingInvoiceAttachmentFileUrl(invoiceId: string, attachmentId: string): string {
  const token = getAuthToken() || ''
  const path = `/incoming-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}/file?token=${encodeURIComponent(token)}`
  return apiPath(path)
}

export async function fetchIncomingInvoiceAttachmentBlob(
  invoiceId: string,
  attachmentId: string
): Promise<Blob> {
  const path = `/incoming-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}`
  try {
    const { data } = await api.get<Blob>(`${path}/file`, { responseType: 'blob' })
    return assertAttachmentBlob(data)
  } catch (e) {
    if (!axios.isAxiosError(e) || e.response?.status !== 404) {
      await rethrowAxiosBlobError(e)
    }
    const { url } = await fetchIncomingInvoiceAttachmentUrl(invoiceId, attachmentId)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not load attachment (${res.status})`)
    return assertAttachmentBlob(await res.blob())
  }
}

export async function createManualIncomingInvoice(input: {
  vendorName: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  totalAmount?: number
  currency?: string
  poNumber?: string
  jobReference?: string
  paymentTerms?: string
  emailSubject?: string
  emailBodyText?: string
  file?: File
}): Promise<IncomingInvoiceDetail> {
  const form = new FormData()
  form.append('vendorName', input.vendorName)
  if (input.invoiceNumber) form.append('invoiceNumber', input.invoiceNumber)
  if (input.invoiceDate) form.append('invoiceDate', input.invoiceDate)
  if (input.dueDate) form.append('dueDate', input.dueDate)
  if (input.totalAmount != null) form.append('totalAmount', String(input.totalAmount))
  if (input.currency) form.append('currency', input.currency)
  if (input.poNumber) form.append('poNumber', input.poNumber)
  if (input.jobReference) form.append('jobReference', input.jobReference)
  if (input.paymentTerms) form.append('paymentTerms', input.paymentTerms)
  if (input.emailSubject) form.append('emailSubject', input.emailSubject)
  if (input.emailBodyText) form.append('emailBodyText', input.emailBodyText)
  if (input.file) form.append('file', input.file)
  const { data } = await api.post<IncomingInvoiceDetail>('/incoming-invoices', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function updateIncomingInvoice(
  id: string,
  input: {
    vendorName?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    dueDate?: string | null
    subtotal?: number | null
    taxAmount?: number | null
    totalAmount?: number | null
    currency?: string | null
    poNumber?: string | null
    jobReference?: string | null
    jobId?: string | null
    paid?: boolean | null
    reviewed?: boolean | null
    paymentTerms?: string | null
    notes?: string | null
  }
): Promise<IncomingInvoiceDetail> {
  const { data } = await api.patch<IncomingInvoiceDetail>(
    `/incoming-invoices/${encodeURIComponent(id)}`,
    input
  )
  return data
}

export async function rescanIncomingInvoiceFromPdf(id: string): Promise<IncomingInvoiceDetail> {
  const { data } = await api.post<IncomingInvoiceDetail>(
    `/incoming-invoices/${encodeURIComponent(id)}/rescan`
  )
  return data
}

export async function deleteIncomingInvoice(id: string): Promise<void> {
  await api.delete(`/incoming-invoices/${encodeURIComponent(id)}`)
}

export async function syncIncomingInvoices(): Promise<{
  enqueued?: number
  skipped?: number
  scanned?: number
  processed?: number
  completed?: number
  failed?: number
  ignored?: number
  configured?: boolean
}> {
  const { data } = await api.post('/incoming-invoices/admin/sync')
  return data
}
