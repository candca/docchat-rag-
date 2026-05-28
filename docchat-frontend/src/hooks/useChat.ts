import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { ChatWebSocket } from '@/services/websocket'
import { resetChatHistory } from '@/services/api'
import type { Citation, Message } from '@/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function buildChatHistory(messages: Message[]): string[] {
  const history: string[] = []
  let pendingQuestion: string | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      pendingQuestion = message.content
      continue
    }

    if (message.role === 'assistant' && pendingQuestion && message.content.trim()) {
      history.push(`question: ${pendingQuestion}, answer: ${message.content}`)
      pendingQuestion = null
    }
  }

  return history.slice(-4)
}

// ---------------------------------------------------------------------------
// 解析后端非结构化检索预览 → Citation[]
//
// 后端 prettify_source 输出格式（chatbot/helpers/prettier.py）：
//   • **filename.md**
//
//    **Score (0.73)**
//
//    **Preview:**
//    >content_preview
// ---------------------------------------------------------------------------
function parseCitations(retrievalText: string): Citation[] {
  // 每个来源以 "• **" 开头，按它切块
  const blocks = retrievalText.split(/(?:^|\n)\s*•\s*\*\*/).slice(1)
  return blocks
    .map((block, i) => {
      const docName = block.match(/^([^*\n]+?)\*\*/)?.[1]?.trim() ?? ''
      const documentId = block.match(/\*\*Document ID:\*\*\s*([^\n]+)/)?.[1]?.trim()
      const metadataPage = block.match(/\*\*Page:\*\*\s*(\d+)/)?.[1]
      // Preview 后的内容属于当前 source block；完整 chunk 可能包含空行。
      const rawSnippet = block
        .match(/\*\*Preview:\*\*\s*\n?\s*>?\s*([\s\S]+)$/)?.[1]
        ?.trim()
      const snippet = rawSnippet
        ?.replace(/\n\s*>/g, '\n')
        .replace(/\s*\.\.\.\s*$/, '')
        .trim()
      const page = snippet?.match(/##\s*Page\s+(\d+)/i)?.[1]
      return {
        index: i + 1,
        docName,
        documentId,
        snippet,
        page: metadataPage ? Number(metadataPage) : page ? Number(page) : undefined,
      } as Citation
    })
    .filter((c) => c.docName.length > 0)
}

type StreamPhase = 'retrieval' | 'answer'

export function useChat() {
  const {
    messages,
    addMessage,
    updateMessage,
    clearMessages,
    startNewConversation,
  } = useAppStore()

  const [isThinking, setIsThinking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  // Refs: 让 WS 回调（闭包）总能读到最新状态
  const isThinkingRef = useRef(false)
  const isStreamingRef = useRef(false)
  const abortedRef = useRef(false)
  const assistantIdRef = useRef<string>('')
  const phaseRef = useRef<StreamPhase>('retrieval')
  const retrievalBufferRef = useRef<string>('')
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsRef = useRef<ChatWebSocket | null>(null)

  const setThinking = (v: boolean) => {
    isThinkingRef.current = v
    setIsThinking(v)
  }
  const setStreaming = (v: boolean) => {
    isStreamingRef.current = v
    setIsStreaming(v)
  }

  const markStreamDone = () => {
    if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
    setThinking(false)
    setStreaming(false)
  }

  useEffect(() => {
    const ws = new ChatWebSocket(
      // onToken
      (token) => {
        if (abortedRef.current) return

        if (phaseRef.current === 'retrieval') {
          retrievalBufferRef.current += token

          const ANSWER_MARKER = '**Answer:**'
          const SEPARATOR = '--------------------'
          const buf = retrievalBufferRef.current
          const markerIdx = buf.indexOf(ANSWER_MARKER)

          if (markerIdx !== -1) {
            // 检索部分（分隔线前）解析为 citations
            const separatorIdx = buf.indexOf(SEPARATOR)
            const retrievalPart = buf.slice(0, separatorIdx !== -1 ? separatorIdx : markerIdx)
            const citations = parseCitations(retrievalPart)
            if (citations.length > 0) {
              updateMessage(assistantIdRef.current, { citations })
            }

            // marker 之后的内容作为答案开头
            const afterMarker = buf.slice(markerIdx + ANSWER_MARKER.length).trimStart()
            phaseRef.current = 'answer'
            // 不在这里关 thinking：marker 通常先于 LLM 首 token 到达，
            // 关掉会出现"思考中消失但又没文字"的卡顿。
            // 真正的 thinking → streaming 切换交给下面的 answer 分支。
            if (afterMarker) {
              if (isThinkingRef.current) setThinking(false)
              if (!isStreamingRef.current) setStreaming(true)
              updateMessage(assistantIdRef.current, { content: afterMarker })
              if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
              streamingTimeoutRef.current = setTimeout(markStreamDone, 500)
            }
          }
          return
        }

        // phase === 'answer'：追加 token（用 getState 避免 stale closure）
        if (isThinkingRef.current) setThinking(false)
        if (!isStreamingRef.current) setStreaming(true)
        // 仅在 answer 阶段才用"500ms 无 token = 流结束"，否则
        // LLM 首 token 延迟会被误判为流结束、把 thinking 一并关掉
        if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = setTimeout(markStreamDone, 500)
        const currentContent =
          useAppStore.getState().messages.find((m) => m.id === assistantIdRef.current)
            ?.content ?? ''
        updateMessage(assistantIdRef.current, { content: currentContent + token })
      },
      // onError
      (errorMsg) => {
        if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
        if (!abortedRef.current) {
          updateMessage(assistantIdRef.current, { content: `连接错误：${errorMsg}` })
        }
        setThinking(false)
        setStreaming(false)
      },
    )

    wsRef.current = ws

    return () => {
      if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
      ws.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => {
    abortedRef.current = true
    if (streamingTimeoutRef.current) clearTimeout(streamingTimeoutRef.current)
    setThinking(false)
    setStreaming(false)
  }

  const sendMessage = (content: string) => {
    if (isThinkingRef.current || isStreamingRef.current) return
    abortedRef.current = false
    phaseRef.current = 'retrieval'
    retrievalBufferRef.current = ''
    const previousMessages = useAppStore.getState().messages
    const chatHistory = buildChatHistory(previousMessages)

    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    addMessage(userMsg)

    const assistantId = genId()
    assistantIdRef.current = assistantId
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
      timestamp: Date.now(),
    })

    setThinking(true)
    const { selectedDocIds, activeDocId } = useAppStore.getState()
    const documentIds = selectedDocIds.length > 0 ? selectedDocIds : activeDocId ? [activeDocId] : []
    void wsRef.current?.sendMessage(content, true /* rag */, documentIds, chatHistory)
  }

  const handleClearMessages = () => {
    clearMessages()
    wsRef.current?.reconnect()
    void resetChatHistory()
  }

  const handleStartNewChat = () => {
    startNewConversation()
    wsRef.current?.reconnect()
    void resetChatHistory()
  }

  return {
    messages,
    isThinking,
    isStreaming,
    sendMessage,
    stop,
    startNewChat: handleStartNewChat,
    clearMessages: handleClearMessages,
  }
}
