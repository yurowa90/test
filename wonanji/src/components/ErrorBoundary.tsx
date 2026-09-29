import { Component, type ReactNode } from "react";

/** 예상하지 못한 오류가 나도 빈 화면 대신 원인과 다시 시작 방법을 보여 줍니다. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-xl rounded-lg border border-danger/30 bg-danger-soft px-6 py-5 text-danger">
        <p className="font-semibold">처리 중 오류가 났습니다.</p>
        <p className="mt-1 text-sm">{this.state.error.message}</p>
        <p className="mt-3 text-sm text-ink-soft">어느 파일에서 멈췄는지 알려 주시면 고치겠습니다. 파일 내용은 이 브라우저 밖으로 나가지 않았습니다.</p>
        <button type="button" onClick={() => location.reload()} className="mt-4 rounded-md bg-blueprint px-4 py-2 text-sm font-semibold text-white">
          처음부터 다시
        </button>
      </div>
    );
  }
}
