import { MessageSquareText, Plus, Trash2, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TITLE = "DocChat";
const SUBTITLE = "基于当前文档对话";

export interface ChatHeaderProps {
  /** 当前主题模式,决定主题切换按钮的图标 */
  theme: "light" | "dark";
  /** 点击"新建对话"按钮触发 */
  onNewChat: () => void;
  /** 点击"清空记录"按钮触发 */
  onClearHistory: () => void;
  /** 点击主题切换按钮触发 */
  onToggleTheme: () => void;
}

export function ChatHeader({
  theme,
  onNewChat,
  onClearHistory,
  onToggleTheme,
}: ChatHeaderProps) {
  const isDark = theme === "dark";

  return (
    <header
      className="flex h-14 w-full items-center justify-between border-b border-border bg-background px-4"
      role="banner"
    >
        {/* 左侧:图标 + 标题 + 副标题 */}
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageSquareText
            className="h-5 w-5 shrink-0 text-foreground"
            aria-hidden="true"
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-base font-semibold text-foreground leading-none">
              {TITLE}
            </h1>
            <span className="text-xs text-muted-foreground truncate leading-none">
              {SUBTITLE}
            </span>
          </div>
        </div>

        {/* 右侧:操作按钮区 */}
        <div className="flex items-center gap-2">
          {/* 新建对话 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNewChat}
                aria-label="新建对话"
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>新建对话</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>开始一段新的对话</p>
            </TooltipContent>
          </Tooltip>

          {/* 清空记录 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearHistory}
                aria-label="清空对话记录"
                className="hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>清空当前对话记录</p>
            </TooltipContent>
          </Tooltip>

          {/* 主题切换 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                aria-label={isDark ? "切换至浅色主题" : "切换至深色主题"}
              >
                {isDark ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isDark ? "切换至浅色主题" : "切换至深色主题"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
    </header>
  );
}
