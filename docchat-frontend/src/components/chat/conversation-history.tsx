import { MessageSquareText, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/types"

export interface ConversationHistoryProps {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return "刚刚"
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}

export function ConversationHistory({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
}: ConversationHistoryProps) {
  return (
    <section className="flex min-h-[170px] max-h-[34vh] flex-col border-b border-border bg-muted/30">
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
          历史对话
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground/60">
          {conversations.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {conversations.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/80 text-[12px] text-muted-foreground">
            暂无历史
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId
              const messageCount = conversation.messages.length

              return (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      isActive ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-background/60",
                    )}
                  >
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{formatDate(conversation.updatedAt)}</span>
                        <span className="opacity-40">·</span>
                        <span>{messageCount} 条</span>
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(conversation.id)
                    }}
                    className={cn(
                      "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md",
                      "text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive",
                      "group-hover:opacity-100",
                      isActive && "opacity-100",
                    )}
                    aria-label="删除对话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
