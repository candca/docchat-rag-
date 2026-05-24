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
  filename: string
  size: number
  content_type: string
  summary?: DocumentSummary | null
}

interface DocumentUploadResponse {
  document_id: string
  filename: string
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
}

export async function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DocumentUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post<DocumentUploadResponse>(
    '/documents',
    formData,
    {
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

export async function listDocuments(): Promise<DocumentListResponse> {
  const response = await api.get<DocumentListResponse>('/documents')
  return response.data
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`)
}

export async function generateDocumentSummary(documentId: string): Promise<DocumentInfo> {
  const response = await api.post<DocumentInfo>(`/documents/${documentId}/summary`)
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

export async function resetChatHistory(): Promise<void> {
  await api.delete('/chat/history')
}
