import { create } from 'zustand'
import type { Message, Document, Citation } from '@/types'

// Re-export Citation so consumers can import from here if needed
export type { Citation }

interface AppState {
  messages: Message[]
  documents: Document[]
  activeCitationIndex: number | null
  activeDocId: string | null
  /** 用户勾选用于本轮检索的文档 id；空集 = 全库检索 */
  selectedDocIds: string[]
  theme: 'light' | 'dark'

  addMessage: (msg: Message) => void
  updateMessage: (id: string, updates: Partial<Omit<Message, 'id'>>) => void
  clearMessages: () => void

  setDocuments: (docs: Document[]) => void
  addDocument: (doc: Document) => void
  updateDocument: (id: string, updates: Partial<Omit<Document, 'id'>>) => void
  removeDocument: (id: string) => void

  setActiveCitationIndex: (index: number | null) => void
  setActiveDocId: (id: string | null) => void
  toggleDocSelected: (id: string) => void
  setSelectedDocIds: (ids: string[]) => void
  toggleTheme: () => void
}

export const useAppStore = create<AppState>((set) => ({
  messages: [],
  documents: [],
  activeCitationIndex: null,
  activeDocId: null,
  selectedDocIds: [],
  theme: 'dark',

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),

  // Also clears activeCitationIndex so the right panel resets
  clearMessages: () => set({ messages: [], activeCitationIndex: null }),

  setDocuments: (docs) =>
    set((s) => {
      // 后端列表变化时，清理掉已不存在的选中项，避免发出无效 id
      const validIds = new Set(docs.map((d) => d.id))
      return {
        documents: docs,
        selectedDocIds: s.selectedDocIds.filter((id) => validIds.has(id)),
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
}))
