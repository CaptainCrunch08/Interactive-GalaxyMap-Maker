import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Short label for the failed view (e.g. "Strategic map"). */
  label?: string;
};

type State = {
  error: Error | null;
};

/**
 * Catch render/runtime errors in WebGL / Three.js views so the rest of the
 * app shell stays usable.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[galaxy] ${this.props.label ?? "View"} crashed`, error, info);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const label = this.props.label ?? "This view";
      return (
        <div className="h-full w-full flex items-center justify-center p-6">
          <div className="hud-panel max-w-md px-4 py-4 border border-rose-400/40">
            <h2 className="font-display text-sm uppercase tracking-wider text-rose-300">
              {label} failed
            </h2>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <button type="button" className="hud-btn mt-3" onClick={this.retry}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
