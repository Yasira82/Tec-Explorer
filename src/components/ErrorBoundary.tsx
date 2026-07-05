'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children:  ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?:   Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{ minHeight: '100vh', background: '#020205', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: '#4a4a5a', marginBottom: 24 }}>
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </div>
            <button
              onClick={() => { this.setState({ hasError: false, error: undefined }); window.location.reload(); }}
              style={{ padding: '12px 24px', background: 'linear-gradient(135deg,#d4af37,#b8882a)', border: 'none', borderRadius: 12, color: '#0a0800', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
