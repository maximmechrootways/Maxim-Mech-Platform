import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
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

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback

            return (
                <div className="flex items-center justify-center min-h-[300px] p-8">
                    <div className="text-center max-w-md">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                            This page encountered an error. Try refreshing or navigating to a different page.
                        </p>
                        {this.state.error?.message && (
                            <div className="text-left text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 mb-3">
                                <span className="font-medium">Error:</span> {this.state.error.message}
                            </div>
                        )}
                        <button
                            onClick={() => {
                                this.setState({ hasError: false, error: null })
                                window.location.reload()
                            }}
                            className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                        >
                            Refresh Page
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
