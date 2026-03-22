import React, { Component, ErrorInfo, ReactNode } from 'react';

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
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">应用遇到了一些问题</h1>
            <p className="text-gray-600 mb-4 text-sm">
              {this.state.error?.message || '未知错误'}
            </p>
            {this.state.error?.message.includes('supabase') && (
              <div className="bg-blue-50 text-blue-700 p-3 rounded text-xs text-left mb-4">
                <strong>提示：</strong> 请检查 .env 文件中的 Supabase 配置。如果尚未配置，请填入有效的 URL 和 Key，或者保留为空字符串以使用模拟模式（如果支持）。
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
