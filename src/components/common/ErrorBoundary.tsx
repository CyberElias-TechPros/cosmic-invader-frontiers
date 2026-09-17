import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPanel } from './atoms';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash inside one screen shows a recoverable
 * panel instead of a white page, and reports the failure to telemetry.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dynamic import keeps telemetry out of the critical path of the crash.
    void import('@/lib/telemetry')
      .then(({ track }) => track('ui_error', { message: error.message.slice(0, 160), component: info.componentStack?.slice(0, 160) ?? '' }))
      .catch(() => undefined);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <ErrorPanel
          title="This screen failed to render"
          message={error.message}
          onRetry={() => this.setState({ error: null })}
        />
      </div>
    );
  }
}
