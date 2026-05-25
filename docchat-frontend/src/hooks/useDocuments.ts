import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { Document } from '@/types'
import { listDocuments, uploadDocument, deleteDocument, generateDocumentSummary, rebuildDocumentIndex } from '@/services/api'
import { formatRequestError } from '@/lib/error'

export interface UploadProgress {
  filename: string
  progress: number
}

function extOfFilename(filename: string): Document['type'] {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  return 'md'
}

export function useDocuments(enabled = true, knowledgeBaseId?: string | null, onChanged?: () => void) {
  const { documents, removeDocument } = useAppStore()

  const [uploading, setUploading] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summarizingId, setSummarizingId] = useState<string | null>(null)

  // 防止组件卸载后仍执行 setState
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchDocuments = useCallback(async (): Promise<boolean> => {
    try {
      const data = await listDocuments(knowledgeBaseId)
      if (!mountedRef.current) return true
      // 用后端返回覆盖 store，整体替换
      const { setDocuments } = useAppStore.getState()
      setDocuments(
        data.documents.map((info) => ({
          id: info.document_id,
          knowledgeBaseId: info.knowledge_base_id,
          name: info.filename,
          type: extOfFilename(info.filename),
          status: info.parse_status ?? 'ready',
          uploadedAt: Date.now(),
          size: info.size,
          summary: info.summary ?? null,
        })),
      )
      // 拉成功就清掉上一次的"加载文档列表失败"
      if (mountedRef.current) setError((prev) => (prev === '加载文档列表失败' ? null : prev))
      return true
    } catch {
      if (mountedRef.current) setError('加载文档列表失败')
      return false
    }
  }, [knowledgeBaseId])

  // 启动时拉一次；若后端尚未就绪（lifespan 还在加载模型），按指数退避自动重试。
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const attempt = async (delay: number) => {
      if (!enabled) return
      if (cancelled) return
      const ok = await fetchDocuments()
      if (ok || cancelled) return
      const next = Math.min(delay * 2, 5000)
      timer = setTimeout(() => void attempt(next), delay)
    }

    if (enabled) void attempt(500)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, fetchDocuments])

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setUploading({ filename: file.name, progress: 0 })
      try {
        const uploaded = await uploadDocument(file, knowledgeBaseId, (pct) => {
          if (mountedRef.current) setUploading({ filename: file.name, progress: pct })
        })
        await fetchDocuments()
        onChanged?.()
        const { setActiveDocId, setSelectedDocIds } = useAppStore.getState()
        setActiveDocId(uploaded.document_id)
        setSelectedDocIds([uploaded.document_id])
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } }
        const msg =
          axiosErr.response?.status === 409
            ? `"${file.name}" 已存在，请勿重复上传`
            : formatRequestError(err, '上传失败，请重试')
        if (mountedRef.current) setError(msg)
        // 让调用方（DocumentUpload）也能感知失败，刷新它的本地 UI
        throw new Error(msg)
      } finally {
        if (mountedRef.current) setUploading(null)
      }
    },
    [fetchDocuments, knowledgeBaseId, onChanged],
  )

  const handleRemove = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await deleteDocument(id)
        removeDocument(id)
        onChanged?.()
      } catch {
        if (mountedRef.current) setError('删除失败，请重试')
      }
    },
    [removeDocument, onChanged],
  )

  const handleGenerateSummary = useCallback(async (id: string) => {
    setError(null)
    setSummarizingId(id)
    try {
      const info = await generateDocumentSummary(id)
      const { updateDocument } = useAppStore.getState()
      updateDocument(id, { summary: info.summary ?? null })
    } catch (err) {
      if (mountedRef.current) setError(formatRequestError(err, '摘要生成失败，请重试'))
    } finally {
      if (mountedRef.current) setSummarizingId(null)
    }
  }, [])

  const handleRebuildIndex = useCallback(async (id: string) => {
    setError(null)
    const { updateDocument } = useAppStore.getState()
    updateDocument(id, { status: 'indexing' })
    try {
      const info = await rebuildDocumentIndex(id)
      updateDocument(id, {
        status: info.parse_status ?? 'ready',
        summary: info.summary ?? null,
      })
    } catch (err) {
      updateDocument(id, { status: 'error' })
      if (mountedRef.current) setError(formatRequestError(err, '重建索引失败，请重试'))
    }
  }, [])

  return {
    documents,
    uploading,
    error,
    summarizingId,
    addDocument: handleUpload,
    removeDocument: handleRemove,
    generateSummary: handleGenerateSummary,
    rebuildIndex: handleRebuildIndex,
    refreshDocuments: fetchDocuments,
  }
}
