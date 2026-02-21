import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-construction-bg p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl border-4 border-construction-border p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-construction-black mb-4 font-header uppercase">
              Something Went Wrong
            </h1>
            <p className="text-construction-muted mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                localStorage.clear()
                window.location.href = '/login/owner'
              }}
              className="px-6 py-3 bg-construction-yellow text-construction-black font-bold uppercase rounded-md shadow-md hover:shadow-lg transition-all"
            >
              Return to Login
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
