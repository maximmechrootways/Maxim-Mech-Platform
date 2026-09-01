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

async function assertPdfBlob(blob: Blob): Promise<Blob> {
  const headerBytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const isPdf = headerBytes.length >= 5
    && String.fromCharCode(...headerBytes.slice(0, 5)) === '%PDF-'
  if (isPdf) return blob
  const message = await readBlobErrorMessage(blob)
  throw new Error(message || 'Could not load attachment')
}

async function rethrowAxiosBlobError(e: unknown): Promise<never> {
  if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
    const message = await readBlobErrorMessage(e.response.data)
    if (message) throw new Error(message)
    if (e.response.status === 401) throw new Error('Your session expired. Please sign in again.')
  }
  throw e
}

export type OutgoingInvoiceStatus = 'SENT' | 'PAID' | 'OVERDUE' | 'PARTIAL'

export type OutgoingInvoiceListRow = {
  id: string
  emailSubject: string | null
  emailTo: string | null
  sentAt: string | null
  customerName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  totalAmount: string | null
  paidAmount: string | null
  currency: string | null
  orderNumber: string | null
  supplierNumber: string | null
  projectName: string | null
  jobId: string | null
  jobTitle: string | null
  paidAt: string | null
  reviewedAt: string | null
  reviewedById: string | null
  reviewedByName: string | null
  paymentTerms: string | null
  notes: string | null
  status: string
  attachmentCount: number
  attachments: Array<{ id: string; originalName: string }>
}

export type OutgoingInvoiceDetail = {
  id: string
  gmailMessageId: string
  sourceSequence: number
  emailSubject: string | null
  emailBodyText: string | null
  emailBodyHtml: string | null
  emailFrom: string | null
  emailTo: string | null
  sentAt: string | null
  status: string
  customerName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  subtotal: string | null
  taxAmount: string | null
  totalAmount: string | null
  paidAmount: string | null
  currency: string | null
  orderNumber: string | null
  supplierNumber: string | null
  projectName: string | null
  jobId: string | null
  jobTitle: string | null
  paidAt: string | null
  reviewedAt: string | null
  reviewedById: string | null
  reviewedByName: string | null
  paymentTerms: string | null
  notes: string | null
  extractedData: unknown
  processedAt: string | null
  lastReminderAt: string | null
  attachments: Array<{
    id: string
    attachmentIndex: number
    originalName: string
    mimeType: string | null
    sizeBytes: number | null
    ocrText: string | null
  }>
}

export async function fetchOutgoingInvoicesSummary(): Promise<{
  total: number
  sentThisMonth: number
  paidThisMonth: number
  failedJobs: number
  outstandingTotal: number
  overdueCount: number
  overdueAmount: number
}> {
  const { data } = await api.get('/outgoing-invoices/summary')
  return data
}

export async function fetchOutgoingInvoices(params?: {
  q?: string
  customer?: string
  dateFrom?: string
  dateTo?: string
  minTotal?: number
  maxTotal?: number
  status?: string
  reviewed?: string
  sort?: string
  limit?: number
  offset?: number
}): Promise<{ rows: OutgoingInvoiceListRow[]; total: number }> {
  const { data, headers } = await api.get<{ rows: OutgoingInvoiceListRow[]; total: number }>(
    '/outgoing-invoices',
    { params }
  )
  const headerTotal = Number(headers['x-total-count'])
  return {
    rows: data.rows ?? [],
    total: Number.isFinite(headerTotal) ? headerTotal : data.total ?? 0,
  }
}

export async function fetchOutgoingInvoiceDetail(id: string): Promise<OutgoingInvoiceDetail> {
  const { data } = await api.get<OutgoingInvoiceDetail>(`/outgoing-invoices/${encodeURIComponent(id)}`)
  return data
}

export async function fetchOutgoingInvoiceAttachmentUrl(
  invoiceId: string,
  attachmentId: string
): Promise<{ url: string; originalName: string }> {
  const { data } = await api.get<{ url: string; originalName: string }>(
    `/outgoing-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}/download`
  )
  return data
}

export async function fetchOutgoingInvoiceAttachmentBlob(
  invoiceId: string,
  attachmentId: string
): Promise<Blob> {
  const path = `/outgoing-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}`
  try {
    const { data } = await api.get<Blob>(`${path}/file`, { responseType: 'blob' })
    return assertPdfBlob(data)
  } catch (e) {
    if (!axios.isAxiosError(e) || e.response?.status !== 404) {
      await rethrowAxiosBlobError(e)
    }
    const { url } = await fetchOutgoingInvoiceAttachmentUrl(invoiceId, attachmentId)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not load attachment (${res.status})`)
    return assertPdfBlob(await res.blob())
  }
}

export function getOutgoingInvoiceAttachmentFileUrl(invoiceId: string, attachmentId: string): string {
  const token = getAuthToken() || ''
  const path = `/outgoing-invoices/${encodeURIComponent(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}/file?token=${encodeURIComponent(token)}`
  return apiPath(path)
}

export async function updateOutgoingInvoice(
  id: string,
  input: {
    customerName?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    dueDate?: string | null
    subtotal?: number | null
    taxAmount?: number | null
    totalAmount?: number | null
    paidAmount?: number | null
    currency?: string | null
    orderNumber?: string | null
    supplierNumber?: string | null
    projectName?: string | null
    jobId?: string | null
    paid?: boolean | null
    reviewed?: boolean | null
    paymentTerms?: string | null
    notes?: string | null
  }
): Promise<OutgoingInvoiceDetail> {
  const { data } = await api.patch<OutgoingInvoiceDetail>(
    `/outgoing-invoices/${encodeURIComponent(id)}`,
    input
  )
  return data
}

export async function rescanOutgoingInvoiceFromPdf(id: string): Promise<OutgoingInvoiceDetail> {
  const { data } = await api.post<OutgoingInvoiceDetail>(
    `/outgoing-invoices/${encodeURIComponent(id)}/rescan`
  )
  return data
}

export async function deleteOutgoingInvoice(id: string): Promise<void> {
  await api.delete(`/outgoing-invoices/${encodeURIComponent(id)}`)
}

export async function syncOutgoingInvoices(): Promise<{
  enqueued?: number
  skipped?: number
  scanned?: number
  processed?: number
  completed?: number
  failed?: number
  ignored?: number
  configured?: boolean
}> {
  const { data } = await api.post('/outgoing-invoices/admin/sync')
  return data
}
