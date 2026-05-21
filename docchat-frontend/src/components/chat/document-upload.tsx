import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react"
import { Upload, FileUp, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// 类型
// ============================================================================

type UploadStatus = "idle" | "uploading" | "success" | "error"

interface UploadProgress {
  fileName: string
  status: UploadStatus
  progress: number // 0-100
  errorMsg?: string
}

export interface DocumentUploadProps {
  /** 选中文件后触发，父组件负责实际上传并回传进度 */
  onSelectFile?: (file: File) => void | Promise<void>
  /** 父组件驱动的上传进度（0-100） */
  externalProgress?: number | null
  /** 父组件驱动的错误信息 */
  externalError?: string | null
  /** 接受的文件类型 */
  accept?: string
  /** 单文件最大大小(MB) */
  maxSizeMB?: number
  /** 是否禁用 */
  disabled?: boolean
}

// ============================================================================
// 组件
// ============================================================================

export function DocumentUpload({
  onSelectFile,
  externalProgress,
  externalError,
  accept = ".pdf,.docx,.md",
  maxSizeMB = 50,
  disabled = false,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localState, setLocalState] = useState<UploadProgress | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 记录是否处于"父级正在上传"状态，用来检测从有 → 无的下降沿
  const wasUploadingRef = useRef(false)

  // 把外部进度合并到本地展示
  const progress: UploadProgress | null = (() => {
    if (externalError && localState) {
      return { ...localState, status: "error", errorMsg: externalError }
    }
    if (externalProgress !== null && externalProgress !== undefined && localState) {
      if (externalProgress >= 100) {
        return { ...localState, status: "success", progress: 100 }
      }
      return { ...localState, status: "uploading", progress: externalProgress }
    }
    return localState
  })()

  // 父级上传状态从有变无 → 视为成功，亮一下"上传成功"再自动隐藏
  useEffect(() => {
    const isUploadingNow =
      externalProgress !== null && externalProgress !== undefined && externalProgress < 100
    if (wasUploadingRef.current && !isUploadingNow && !externalError) {
      setLocalState((prev) =>
        prev && prev.status === "uploading"
          ? { ...prev, status: "success", progress: 100 }
          : prev,
      )
    }
    wasUploadingRef.current = isUploadingNow
  }, [externalProgress, externalError])

  // 进入 success 状态后 1.2s 自动收起，让出上传按钮
  useEffect(() => {
    if (localState?.status !== "success") return
    const t = setTimeout(() => setLocalState(null), 1200)
    return () => clearTimeout(t)
  }, [localState?.status])

  const handleFile = (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      setLocalState({
        fileName: file.name,
        status: "error",
        progress: 0,
        errorMsg: `文件超过 ${maxSizeMB}MB 限制`,
      })
      return
    }
    setLocalState({ fileName: file.name, status: "uploading", progress: 0 })
    // 父级是 async 上传：用 promise.then 检测完成
    Promise.resolve(onSelectFile?.(file)).then(
      () => {
        setLocalState((prev) =>
          prev && prev.status === "uploading"
            ? { ...prev, status: "success", progress: 100 }
            : prev,
        )
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : "上传失败"
        setLocalState((prev) =>
          prev && prev.status === "uploading"
            ? { ...prev, status: "error", errorMsg: msg }
            : prev,
        )
      },
    )
  }

  // ----- 拖拽 -----
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled && progress?.status !== "uploading") setIsDragging(true)
  }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled || progress?.status === "uploading") return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ----- 文件选择 -----
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  const handleClick = () => {
    if (disabled || progress?.status === "uploading") return
    inputRef.current?.click()
  }

  const handleCancel = () => {
    setLocalState(null)
  }

  const isUploading = progress?.status === "uploading"

  // ============================================================================
  // 渲染
  // ============================================================================

  if (progress) {
    return (
      <div className="px-3 py-2.5">
        <div
          className={cn(
            "rounded-xl border bg-background p-3",
            "transition-colors duration-200",
            progress.status === "error"
              ? "border-destructive/30 bg-destructive/5"
              : progress.status === "success"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border",
          )}
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0">
              {progress.status === "uploading" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" strokeWidth={2} />
              )}
              {progress.status === "success" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              )}
              {progress.status === "error" && (
                <AlertCircle className="h-4 w-4 text-destructive" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {progress.fileName}
                </p>
                {(isUploading || progress.status === "error") && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="取消"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {progress.status === "uploading" && `上传中… ${Math.round(progress.progress)}%`}
                {progress.status === "success" && "上传成功，正在处理"}
                {progress.status === "error" && progress.errorMsg}
              </p>
              {isUploading && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 默认态：拖拽区
  return (
    <div className="px-3 py-2.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault()
            handleClick()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group relative flex flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed bg-background",
          "px-4 py-6 text-center cursor-pointer",
          "transition-all duration-200 ease-out",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          isDragging
            ? "border-primary bg-muted/50 scale-[1.01]"
            : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        )}
      >
        <div
          className={cn(
            "mb-2 flex h-10 w-10 items-center justify-center rounded-full",
            "transition-colors duration-200",
            isDragging
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground",
          )}
        >
          {isDragging ? (
            <FileUp className="h-5 w-5" strokeWidth={2} />
          ) : (
            <Upload className="h-4 w-4" strokeWidth={2} />
          )}
        </div>
        <p className="text-[13px] font-medium text-foreground">
          {isDragging ? "松开以上传" : "上传文档"}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          点击或拖拽 · PDF / DOCX / MD
        </p>
      </div>
    </div>
  )
}
