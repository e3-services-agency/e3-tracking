/**
 * Root error boundary to prevent white screen and surface runtime errors.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('App error boundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#F9FAFB] text-gray-900 font-sans"
          role="alert"
        >
          <h1 className="text-xl font-bold text-red-600 mb-4">
            Something went wrong
          </h1>
          <pre className="max-w-2xl w-full p-4 bg-white border border-red-200 rounded-lg text-sm overflow-auto text-left">
            {this.state.error.message}
          </pre>
          {this.state.errorInfo?.componentStack && (
            <details className="mt-4 max-w-2xl w-full text-left">
              <summary className="cursor-pointer text-sm text-gray-600">
                Component stack
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            className="mt-6 px-4 py-2 bg-[#3E52FF] text-white rounded-md hover:bg-blue-600"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
