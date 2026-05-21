import { useCallback, useEffect, useMemo } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChatHeader } from '@/components/chat/chat-header'
import { ChatViewport } from '@/components/chat/chat-viewport'
import { ChatInput } from '@/components/chat/chat-input'
import { DocumentList } from '@/components/chat/document-list'
import { CitationPanel } from '@/components/chat/citation-panel'
import { useAppStore } from '@/stores/appStore'
import { useChat } from '@/hooks/useChat'
import { useDocuments } from '@/hooks/useDocuments'

function App() {
  const {
    theme,
    activeCitationIndex,
    activeDocId,
    selectedDocIds,
    setActiveCitationIndex,
    setActiveDocId,
    toggleDocSelected,
    toggleTheme,
  } = useAppStore()

  const { messages, isThinking, isStreaming, sendMessage, stop, clearMessages } = useChat()
  const { documents, error, addDocument, removeDocument } = useDocuments()

  // 同步 theme 到 <html> class
  useEffect(() => {
    const html = document.documentElement
    theme === 'dark' ? html.classList.add('dark') : html.classList.remove('dark')
  }, [theme])

  // 最近一条完成的 assistant 消息的 citations → 右栏
  const citations = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    return last?.citations ?? []
  }, [messages])

  const readyDocCount = documents.filter((d) => d.status === 'ready').length

  const handleSend = useCallback(
    (content: string) => {
      setActiveCitationIndex(null)
      sendMessage(content)
    },
    [sendMessage, setActiveCitationIndex],
  )

  const handleClear = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handleCitationClick = useCallback(
    (index: number) => {
      setActiveCitationIndex(index)
    },
    [setActiveCitationIndex],
  )

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* 左栏：文档列表 (260px) */}
        <div className="w-[260px] shrink-0 overflow-hidden flex flex-col">
          <DocumentList
            documents={documents}
            activeDocId={activeDocId}
            selectedDocIds={selectedDocIds}
            onToggleSelected={toggleDocSelected}
            onSelect={setActiveDocId}
            onDelete={removeDocument}
            onUpload={addDocument}
          />
          {/* 上传错误提示 */}
          {error && (
            <div className="mx-3 mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* 中栏：聊天 (flex-1) */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden border-x border-border">
          <ChatHeader
            theme={theme}
            onNewChat={handleClear}
            onClearHistory={handleClear}
            onToggleTheme={toggleTheme}
          />
          <ChatViewport
            messages={messages}
            isThinking={isThinking}
            onExampleClick={handleSend}
            onCitationClick={handleCitationClick}
          />
          <ChatInput
            onSend={handleSend}
            isGenerating={isStreaming}
            onStop={stop}
            selectedDocCount={readyDocCount}
          />
        </div>

        {/* 右栏：引用面板 (320px) */}
        <div className="w-[320px] shrink-0 overflow-hidden">
          <CitationPanel
            citations={citations}
            activeCitationIndex={activeCitationIndex}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
