import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Message, Document, Citation, Conversation } from '@/types'

// Re-export Citation so consumers can import from here if needed
export type { Citation }

interface AppState {
  messages: Message[]
  conversations: Conversation[]
  activeConversationId: string | null
  documents: Document[]
  activeCitationIndex: number | null
  activeDocId: string | null
  /** 用户勾选用于本轮检索的文档 id；空集 = 全库检索 */
  selectedDocIds: string[]
  theme: 'light' | 'dark'

  addMessage: (msg: Message) => void
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id'>>) => void
  clearMessages: () => void
  startNewConversation: () => void
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  clearAllConversations: () => void

  setDocuments: (docs: Document[]) => void
  addDocument: (doc: Document) => void
  updateDocument: (id: string, updates: Partial<Omit<Document, 'id'>>) => void
  removeDocument: (id: string) => void

  setActiveCitationIndex: (index: number | null) => void
  setActiveDocId: (id: string | null) => void
  toggleDocSelected: (id: string) => void
  setSelectedDocIds: (ids: string[]) => void
  toggleTheme: () => void
  switchUserState: (userId: string) => void
  resetUserState: () => void
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function titleFromMessages(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim())
  if (!firstUser) return '新对话'
  const title = firstUser.content.trim().replace(/\s+/g, ' ')
  return title.length > 24 ? `${title.slice(0, 24)}...` : title
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function syncActiveConversation(state: AppState, messages: Message[]) {
  const now = Date.now()
  const activeId = state.activeConversationId ?? genId()
  const current = state.conversations.find((c) => c.id === activeId)
  const activeConversation: Conversation = {
    id: activeId,
    title: titleFromMessages(messages),
    messages,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }

  return {
    messages,
    activeConversationId: activeId,
    conversations: sortConversations([
      activeConversation,
      ...state.conversations.filter((c) => c.id !== activeId),
    ]),
  }
}

type UserStateSnapshot = Pick<
  AppState,
  'messages' | 'conversations' | 'activeConversationId' | 'selectedDocIds' | 'activeDocId'
>

let activeUserId: string | null = localStorage.getItem('docchat-active-user-id')

function userStateKey(userId: string): string {
  return `docchat-user-state:${userId}`
}

function snapshot(state: AppState): UserStateSnapshot {
  return {
    messages: state.messages,
    conversations: state.conversations,
    activeConversationId: state.activeConversationId,
    selectedDocIds: state.selectedDocIds,
    activeDocId: state.activeDocId,
  }
}

function saveUserState(userId: string | null, state: AppState) {
  if (!userId) return
  localStorage.setItem(userStateKey(userId), JSON.stringify(snapshot(state)))
}

function loadUserState(userId: string): UserStateSnapshot {
  const empty: UserStateSnapshot = {
    messages: [],
    conversations: [],
    activeConversationId: null,
    selectedDocIds: [],
    activeDocId: null,
  }
  const raw = localStorage.getItem(userStateKey(userId))
  if (!raw) {
    return empty
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UserStateSnapshot>
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
      activeConversationId: typeof parsed.activeConversationId === 'string' ? parsed.activeConversationId : null,
      selectedDocIds: Array.isArray(parsed.selectedDocIds) ? parsed.selectedDocIds : [],
      activeDocId: typeof parsed.activeDocId === 'string' ? parsed.activeDocId : null,
    }
  } catch {
    return empty
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
  messages: [],
  conversations: [],
  activeConversationId: null,
  documents: [],
  activeCitationIndex: null,
  activeDocId: null,
  selectedDocIds: [],
  theme: 'dark',

  addMessage: (msg) =>
    set((s) => syncActiveConversation(s, [...s.messages, msg])),

  updateMessage: (id, updates) =>
    set((s) => {
      const messages = s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      )
      return syncActiveConversation(s, messages)
    }),

  // Also clears activeCitationIndex so the right panel resets
  clearMessages: () =>
    set((s) => {
      if (!s.activeConversationId) {
        return { messages: [], activeCitationIndex: null }
      }
      return {
        ...syncActiveConversation(s, []),
        activeCitationIndex: null,
      }
    }),

  startNewConversation: () =>
    set({
      activeConversationId: null,
      messages: [],
      activeCitationIndex: null,
    }),

  selectConversation: (id) =>
    set((s) => {
      const conversation = s.conversations.find((c) => c.id === id)
      if (!conversation) return {}
      return {
        activeConversationId: id,
        messages: conversation.messages,
        activeCitationIndex: null,
      }
    }),

  deleteConversation: (id) =>
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id)
      if (s.activeConversationId !== id) {
        return { conversations }
      }

      const next = conversations[0]
      return {
        conversations,
        activeConversationId: next?.id ?? null,
        messages: next?.messages ?? [],
        activeCitationIndex: null,
      }
    }),

  clearAllConversations: () =>
    set({
      conversations: [],
      activeConversationId: null,
      messages: [],
      activeCitationIndex: null,
    }),

  setDocuments: (docs) =>
    set((s) => {
      // 后端列表变化时，清理掉已不存在的选中项，避免发出无效 id
      const validIds = new Set(docs.map((d) => d.id))
      return {
        documents: docs,
        selectedDocIds: s.selectedDocIds.filter((id) => validIds.has(id)),
        activeDocId: s.activeDocId && validIds.has(s.activeDocId) ? s.activeDocId : null,
      }
    }),

  addDocument: (doc) =>
    set((s) => ({ documents: [...s.documents, doc] })),

  updateDocument: (id, updates) =>
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === id ? { ...d, ...updates } : d,
      ),
    })),

  removeDocument: (id) =>
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      activeDocId: s.activeDocId === id ? null : s.activeDocId,
      selectedDocIds: s.selectedDocIds.filter((x) => x !== id),
    })),

  setActiveCitationIndex: (index) => set({ activeCitationIndex: index }),
  setActiveDocId: (id) => set({ activeDocId: id }),
  toggleDocSelected: (id) =>
    set((s) => ({
      selectedDocIds: s.selectedDocIds.includes(id)
        ? s.selectedDocIds.filter((x) => x !== id)
        : [...s.selectedDocIds, id],
    })),
  setSelectedDocIds: (ids) => set({ selectedDocIds: ids }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  switchUserState: (userId) =>
    set((s) => {
      if (activeUserId !== userId) {
        saveUserState(activeUserId, s)
      }
      activeUserId = userId
      localStorage.setItem('docchat-active-user-id', userId)
      const loaded = loadUserState(userId)
      return {
        ...loaded,
        documents: [],
        activeCitationIndex: null,
      }
    }),

  resetUserState: () =>
    set((s) => {
      saveUserState(activeUserId, s)
      activeUserId = null
      localStorage.removeItem('docchat-active-user-id')
      return {
        messages: [],
        conversations: [],
        activeConversationId: null,
        documents: [],
        activeDocId: null,
        selectedDocIds: [],
        activeCitationIndex: null,
      }
    }),
    }),
    {
      name: 'docchat-app-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        messages: state.messages,
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        selectedDocIds: state.selectedDocIds,
        theme: state.theme,
      }),
    },
  ),
)
