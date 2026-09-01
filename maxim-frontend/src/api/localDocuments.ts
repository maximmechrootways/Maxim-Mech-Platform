import { api } from '@/api'

export interface LocalDocumentMeta {
  id: string
  name: string
  contentType: string | null
  sizeBytes: number
  status: string
  chunkCount: number
  error: string | null
  createdAt: string | null
  project: string
  folderPath: string
}

export interface LocalTreeFolder {
  path: string
  files: LocalDocumentMeta[]
}

export interface LocalTreeProject {
  name: string
  fileCount: number
  folders: LocalTreeFolder[]
}

export interface LocalProjectMatch {
  gx10Project: string
  fileCount: number
  jobId: string | null
  jobTitle: string | null
  siteName: string | null
  jobStatus: string | null
  linked: boolean
}

export async function fetchLocalDocumentTree(project?: string): Promise<LocalTreeProject[]> {
  const { data } = await api.get<{ projects: LocalTreeProject[] }>('/local-documents/tree', {
    params: project ? { project } : undefined,
  })
  return data.projects ?? []
}

export async function fetchLocalDocuments(project?: string): Promise<LocalDocumentMeta[]> {
  const { data } = await api.get<{ documents: LocalDocumentMeta[] }>('/local-documents', {
    params: project ? { project } : undefined,
  })
  return data.documents ?? []
}

export async function fetchLocalProjectMatches(): Promise<LocalProjectMatch[]> {
  const { data } = await api.get<{ matches: LocalProjectMatch[] }>('/local-documents/matches')
  return data.matches ?? []
}

export async function fetchLocalProjectsForJob(jobId: string): Promise<LocalTreeProject[]> {
  const { data } = await api.get<{ projects: LocalTreeProject[] }>(`/local-documents/for-job/${encodeURIComponent(jobId)}`)
  return data.projects ?? []
}

export async function fetchLocalDocumentBlob(documentId: string, download = false): Promise<Blob> {
  const { data } = await api.get<Blob>(`/local-documents/${encodeURIComponent(documentId)}/file`, {
    params: download ? { download: '1' } : undefined,
    responseType: 'blob',
  })
  return data
}

export async function deleteLocalDocument(documentId: string): Promise<void> {
  await api.delete(`/local-documents/${encodeURIComponent(documentId)}`)
}

export async function deleteLocalProject(projectName: string): Promise<{ documentsDeleted?: number }> {
  const { data } = await api.delete<{ documentsDeleted?: number }>('/local-documents/projects', {
    params: { name: projectName },
  })
  return data
}
