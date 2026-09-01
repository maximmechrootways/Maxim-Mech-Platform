import { api } from '@/api'

export type CadViewerStatus = {
  configured: boolean
  sourceKey: string
  fileName: string
  status: string
  progress?: string | null
  urn?: string | null
  error?: string | null
}

export async function fetchCadViewerConfig(): Promise<{ configured: boolean }> {
  const { data } = await api.get<{ configured: boolean }>('/cad-viewer/config')
  return data
}

export async function fetchCadViewerToken(): Promise<{ access_token: string; expires_in: number }> {
  const { data } = await api.get<{ access_token: string; expires_in: number }>('/cad-viewer/token')
  return data
}

export async function prepareLocalCadViewer(documentId: string): Promise<CadViewerStatus> {
  const { data } = await api.post<CadViewerStatus>('/cad-viewer/prepare', {
    source: 'local',
    documentId,
  })
  return data
}

export async function fetchCadViewerStatus(sourceKey: string): Promise<CadViewerStatus> {
  const { data } = await api.get<CadViewerStatus>('/cad-viewer/status', {
    params: { sourceKey },
  })
  return data
}

export function isCadFileName(fileName: string): boolean {
  return /\.(dwg|dxf|dwf|dwfx|rvt|rfa|rte|nwd|nwc|ifc|step|stp|iges|igs|f3d|fbx|obj|stl)$/i.test(fileName)
}
