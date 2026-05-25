import { useCallback, useEffect, useState } from 'react'
import type { KnowledgeBase } from '@/types'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  rebuildKnowledgeBaseIndex,
  renameKnowledgeBase,
} from '@/services/api'
import { formatRequestError } from '@/lib/error'

function mapKnowledgeBase(info: {
  knowledge_base_id: string
  name: string
  document_count: number
  created_at: string
  updated_at: string
}): KnowledgeBase {
  return {
    id: info.knowledge_base_id,
    name: info.name,
    documentCount: info.document_count,
    createdAt: info.created_at,
    updatedAt: info.updated_at,
  }
}

export function useKnowledgeBases(enabled = true) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [activeKnowledgeBaseId, setActiveKnowledgeBaseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const data = await listKnowledgeBases()
      const mapped = data.knowledge_bases.map(mapKnowledgeBase)
      setKnowledgeBases(mapped)
      setActiveKnowledgeBaseId((current) => current && mapped.some((kb) => kb.id === current) ? current : mapped[0]?.id ?? null)
      setError(null)
    } catch (err) {
      setError(formatRequestError(err, '加载知识库失败'))
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addKnowledgeBase = useCallback(async (name: string) => {
    setIsBusy(true)
    try {
      const created = mapKnowledgeBase(await createKnowledgeBase(name))
      setKnowledgeBases((items) => [created, ...items])
      setActiveKnowledgeBaseId(created.id)
      setError(null)
    } catch (err) {
      setError(formatRequestError(err, '新建知识库失败'))
    } finally {
      setIsBusy(false)
    }
  }, [])

  const updateKnowledgeBaseName = useCallback(async (id: string, name: string) => {
    setIsBusy(true)
    try {
      const updated = mapKnowledgeBase(await renameKnowledgeBase(id, name))
      setKnowledgeBases((items) => items.map((kb) => kb.id === id ? updated : kb))
      setError(null)
    } catch (err) {
      setError(formatRequestError(err, '重命名知识库失败'))
    } finally {
      setIsBusy(false)
    }
  }, [])

  const removeKnowledgeBase = useCallback(async (id: string) => {
    setIsBusy(true)
    try {
      await deleteKnowledgeBase(id)
      await refresh()
      setError(null)
    } catch (err) {
      setError(formatRequestError(err, '删除知识库失败'))
    } finally {
      setIsBusy(false)
    }
  }, [refresh])

  const rebuildKnowledgeBase = useCallback(async (id: string) => {
    setIsBusy(true)
    try {
      await rebuildKnowledgeBaseIndex(id)
      await refresh()
      setError(null)
    } catch (err) {
      setError(formatRequestError(err, '重建索引失败'))
    } finally {
      setIsBusy(false)
    }
  }, [refresh])

  return {
    knowledgeBases,
    activeKnowledgeBaseId,
    error,
    isBusy,
    setActiveKnowledgeBaseId,
    addKnowledgeBase,
    updateKnowledgeBaseName,
    removeKnowledgeBase,
    rebuildKnowledgeBase,
    refreshKnowledgeBases: refresh,
  }
}
