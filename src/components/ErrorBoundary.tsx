import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error in School Management System:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#121316] text-white flex items-center justify-center p-6 select-none">
          <div className="max-w-md w-full bg-[#1b1c22] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed">
              An unexpected display issue occurred in the interface. You can reload the portal to
              continue safely.
            </p>
            {this.state.error?.message && (
              <div className="mb-6 p-3 bg-zinc-900/90 border border-zinc-800 rounded-xl text-left">
                <p className="text-[11px] font-mono text-zinc-400 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.99] text-white text-xs sm:text-sm font-semibold transition-all shadow-lg cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload School Portal</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
