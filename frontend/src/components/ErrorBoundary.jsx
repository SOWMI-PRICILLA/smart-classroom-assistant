import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-soft-50 p-8 text-center">
                    <div className="bg-red-50 text-red-600 p-6 rounded-[2rem] border border-red-100 max-w-md shadow-soft">
                        <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
                        <p className="text-sm font-medium mb-6 opacity-80">
                            The application encountered an unexpected error. We've logged this for our team.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-red-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-red-700 soft-transition"
                        >
                            Refresh Application
                        </button>
                        {process.env.NODE_ENV === 'development' && (
                            <pre className="mt-8 text-left text-[10px] bg-red-900/5 p-4 rounded-xl overflow-auto max-h-40">
                                {this.state.error?.toString()}
                            </pre>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
