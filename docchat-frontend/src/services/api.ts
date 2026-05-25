import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTH_TOKEN_KEY = 'docchat-auth-token'

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface UserInfo {
  user_id: string
  username: string
}

export interface AuthResponse {
  token: string
  user: UserInfo
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token)
  else localStorage.removeItem(AUTH_TOKEN_KEY)
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { username, password })
  setAuthToken(response.data.token)
  return response.data
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/register', { username, password })
  setAuthToken(response.data.token)
  return response.data
}

export async function getCurrentUser(): Promise<UserInfo> {
  const response = await api.get<UserInfo>('/auth/me')
  return response.data
}

export interface DocumentInfo {
  document_id: string
  knowledge_base_id: string
  filename: string
  size: number
  content_type: string
  parse_status: 'ready' | 'indexing' | 'error'
  summary?: DocumentSummary | null
}

interface DocumentUploadResponse {
  document_id: string
  knowledge_base_id: string
  filename: string
  parse_status: 'ready' | 'indexing' | 'error'
  summary?: DocumentSummary | null
}

interface DocumentListResponse {
  documents: DocumentInfo[]
}

export interface DocumentContentResponse {
  document_id: string
  filename: string
  content: string
}

export interface DocumentSummary {
  one_sentence: string
  detailed: string
  section_summaries: Array<{ title: string; summary: string }>
  keywords: string[]
  outline: string[]
  summary_origin?: string
}

export interface KnowledgeBaseInfo {
  knowledge_base_id: string
  name: string
  created_at: string
  updated_at: string
  document_count: number
}

interface KnowledgeBaseListResponse {
  knowledge_bases: KnowledgeBaseInfo[]
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseListResponse> {
  const response = await api.get<KnowledgeBaseListResponse>('/knowledge-bases')
  return response.data
}

export async function createKnowledgeBase(name: string): Promise<KnowledgeBaseInfo> {
  const response = await api.post<KnowledgeBaseInfo>('/knowledge-bases', { name })
  return response.data
}

export async function renameKnowledgeBase(id: string, name: string): Promise<KnowledgeBaseInfo> {
  const response = await api.patch<KnowledgeBaseInfo>(`/knowledge-bases/${id}`, { name })
  return response.data
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await api.delete(`/knowledge-bases/${id}`)
}

export async function rebuildKnowledgeBaseIndex(id: string): Promise<DocumentListResponse> {
  const response = await api.post<DocumentListResponse>(`/knowledge-bases/${id}/rebuild-index`)
  return response.data
}

export async function uploadDocument(
  file: File,
  knowledgeBaseId?: string | null,
  onProgress?: (pct: number) => void,
): Promise<DocumentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<DocumentUploadResponse>(
    '/documents',
    formData,
    {
      params: knowledgeBaseId ? { knowledge_base_id: knowledgeBaseId } : undefined,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total))
        }
      },
    },
  )
  return response.data
}

export async function listDocuments(knowledgeBaseId?: string | null): Promise<DocumentListResponse> {
  const response = await api.get<DocumentListResponse>('/documents', {
    params: knowledgeBaseId ? { knowledge_base_id: knowledgeBaseId } : undefined,
  })
  return response.data
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`)
}

export async function generateDocumentSummary(documentId: string): Promise<DocumentInfo> {
  const response = await api.post<DocumentInfo>(`/documents/${documentId}/summary`)
  return response.data
}

export async function rebuildDocumentIndex(documentId: string): Promise<DocumentInfo> {
  const response = await api.post<DocumentInfo>(`/documents/${documentId}/rebuild-index`)
  return response.data
}

export async function getDocumentContent(filename: string): Promise<DocumentContentResponse> {
  const response = await api.get<DocumentContentResponse>('/documents/content', {
    params: { filename },
  })
  return response.data
}

export function getDocumentFileUrl(filename: string): string {
  const params = new URLSearchParams({ filename })
  const token = getAuthToken()
  if (token) params.set('token', token)
  return `${API_BASE}/documents/file?${params.toString()}`
}

export function getDocumentFileUrlById(documentId: string): string {
  const params = new URLSearchParams()
  const token = getAuthToken()
  if (token) params.set('token', token)
  return `${API_BASE}/documents/${documentId}/file?${params.toString()}`
}

export async function resetChatHistory(): Promise<void> {
  await api.delete('/chat/history')
}
