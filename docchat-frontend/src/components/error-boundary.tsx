import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-[420px] rounded-lg border border-border bg-card p-6 shadow-lg">
          <h1 className="text-base font-semibold">页面渲染失败</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            页面收到了无法直接显示的数据。清理本地状态后可以重新登录。
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
          <Button
            className="mt-5 w-full"
            onClick={() => {
              Object.keys(localStorage)
                .filter((key) => key.startsWith("docchat-"))
                .forEach((key) => localStorage.removeItem(key));
              sessionStorage.clear();
              window.location.reload();
            }}
          >
            清理本地状态并刷新
          </Button>
        </div>
      </div>
    );
  }
}
