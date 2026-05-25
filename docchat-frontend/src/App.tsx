import { useCallback, useEffect, useMemo, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChatHeader } from '@/components/chat/chat-header'
import { ChatViewport } from '@/components/chat/chat-viewport'
import { ChatInput } from '@/components/chat/chat-input'
import { DocumentList } from '@/components/chat/document-list'
import { ConversationHistory } from '@/components/chat/conversation-history'
import { CitationPanel } from '@/components/chat/citation-panel'
import { LoginScreen } from '@/components/chat/login-screen'
import { useAppStore } from '@/stores/appStore'
import { useChat } from '@/hooks/useChat'
import { useDocuments } from '@/hooks/useDocuments'
import { useKnowledgeBases } from '@/hooks/useKnowledgeBases'
import { getAuthToken, getCurrentUser, login, register, setAuthToken, type UserInfo } from '@/services/api'
import { formatRequestError } from '@/lib/error'

function App() {
  const {
    theme,
    activeCitationIndex,
    activeDocId,
    activeConversationId,
    conversations,
    selectedDocIds,
    setActiveCitationIndex,
    setActiveDocId,
    setSelectedDocIds,
    selectConversation,
    deleteConversation,
    toggleDocSelected,
    toggleTheme,
    switchUserState,
    resetUserState,
  } = useAppStore()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    messages,
    isThinking,
    isStreaming,
    sendMessage,
    stop,
    startNewChat,
    clearMessages,
  } = useChat()
  const {
    knowledgeBases,
    activeKnowledgeBaseId,
    error: knowledgeBaseError,
    setActiveKnowledgeBaseId,
    addKnowledgeBase,
    updateKnowledgeBaseName,
    removeKnowledgeBase,
    rebuildKnowledgeBase,
    refreshKnowledgeBases,
  } = useKnowledgeBases(Boolean(user))
  const {
    documents,
    error,
    summarizingId,
    addDocument,
    removeDocument,
    generateSummary,
    rebuildIndex,
  } = useDocuments(Boolean(user) && Boolean(activeKnowledgeBaseId), activeKnowledgeBaseId, refreshKnowledgeBases)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setAuthReady(true)
      return
    }
    getCurrentUser()
      .then((currentUser) => {
        switchUserState(currentUser.user_id)
        setUser(currentUser)
      })
      .catch(() => {
        setAuthToken(null)
        resetUserState()
      })
      .finally(() => setAuthReady(true))
  }, [resetUserState, switchUserState])

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

  const handleSelectDocument = useCallback(
    (id: string) => {
      setActiveDocId(id)
      setSelectedDocIds([id])
    },
    [setActiveDocId, setSelectedDocIds],
  )

  const handleCitationClick = useCallback(
    (index: number) => {
      setActiveCitationIndex(index)
    },
    [setActiveCitationIndex],
  )

  const handleAuth = useCallback(
    async (username: string, password: string, mode: 'login' | 'register') => {
      setAuthError(null)
      try {
        const response = mode === 'login'
          ? await login(username, password)
          : await register(username, password)
        switchUserState(response.user.user_id)
        setUser(response.user)
      } catch (error) {
        setAuthError(formatRequestError(error, '登录失败，请检查用户名和密码'))
        throw error
      }
    },
    [switchUserState],
  )

  const handleLogout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
    resetUserState()
  }, [resetUserState])

  if (!authReady) {
    return <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">正在加载...</div>
  }

  if (!user) {
    return (
      <TooltipProvider>
        <LoginScreen onLogin={handleAuth} error={authError} />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* 左栏：文档列表 (260px) */}
        <div className="w-[380px] shrink-0 overflow-hidden flex flex-col">
          <ConversationHistory
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={selectConversation}
            onDelete={deleteConversation}
          />
          <DocumentList
            documents={documents}
            knowledgeBases={knowledgeBases}
            activeKnowledgeBaseId={activeKnowledgeBaseId}
            activeDocId={activeDocId}
            selectedDocIds={selectedDocIds}
            onToggleSelected={toggleDocSelected}
            onSelect={handleSelectDocument}
            onDelete={removeDocument}
            onRebuildDocument={rebuildIndex}
            onCreateKnowledgeBase={addKnowledgeBase}
            onRenameKnowledgeBase={updateKnowledgeBaseName}
            onDeleteKnowledgeBase={removeKnowledgeBase}
            onRebuildKnowledgeBase={rebuildKnowledgeBase}
            onSelectKnowledgeBase={setActiveKnowledgeBaseId}
            onUpload={addDocument}
            onGenerateSummary={generateSummary}
            summarizingDocId={summarizingId}
          />
          {/* 上传错误提示 */}
          {(error || knowledgeBaseError) && (
            <div className="mx-3 mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error || knowledgeBaseError}
            </div>
          )}
        </div>

        {/* 中栏：聊天 (flex-1) */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden border-x border-border">
          <ChatHeader
            theme={theme}
            onNewChat={startNewChat}
            onClearHistory={handleClear}
            onToggleTheme={toggleTheme}
            username={user.username}
            onLogout={handleLogout}
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
        <div className="relative z-20 w-[320px] shrink-0 overflow-visible">
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
