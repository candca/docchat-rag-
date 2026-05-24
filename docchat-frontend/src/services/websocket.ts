type TokenHandler = (token: string) => void
type ErrorHandler = (error: string) => void

const WS_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
  if (apiUrl) {
    return apiUrl.replace(/^http/, 'ws')
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
})()

const WS_URL = `${WS_BASE}/chat/stream`

export class ChatWebSocket {
  private ws: WebSocket | null = null
  private readonly onToken: TokenHandler
  private readonly onError: ErrorHandler

  constructor(onToken: TokenHandler, onError: ErrorHandler) {
    this.onToken = onToken
    this.onError = onError
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }
      if (this.ws?.readyState === WebSocket.CONNECTING) {
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            resolve()
          } else if (this.ws?.readyState === WebSocket.CLOSED) {
            clearInterval(checkConnection)
            reject(new Error('Connection failed'))
          }
        }, 50)
        return
      }

      const token = getAuthToken()
      const url = token ? `${WS_URL}?${new URLSearchParams({ token }).toString()}` : WS_URL
      this.ws = new WebSocket(url)

      this.ws.onopen = () => resolve()

      this.ws.onmessage = (event) => {
        this.onToken(event.data as string)
      }

      this.ws.onerror = () => {
        this.onError('WebSocket connection error')
        reject(new Error('WebSocket connection error'))
      }

      this.ws.onclose = () => {
        this.ws = null
      }
    })
  }

  async sendMessage(
    text: string,
    rag: boolean,
    documentIds?: string[],
    chatHistory?: string[],
  ): Promise<void> {
    try {
      await this.connect()
      if (this.ws?.readyState === WebSocket.OPEN) {
        const payload: Record<string, unknown> = { text, rag }
        if (documentIds && documentIds.length > 0) {
          // 后端字段名是 document_ids（snake_case）
          payload.document_ids = documentIds
        }
        if (chatHistory && chatHistory.length > 0) {
          payload.chat_history = chatHistory
        }
        this.ws.send(JSON.stringify(payload))
      } else {
        this.onError('WebSocket is not connected')
      }
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Failed to connect')
    }
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  reconnect(): void {
    this.disconnect()
    this.ws = null
  }
}
import { getAuthToken } from './api'
