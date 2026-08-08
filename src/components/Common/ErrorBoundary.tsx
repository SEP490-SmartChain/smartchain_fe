import React from 'react';

import { useTranslations } from 'next-intl';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default function ErrorBoundaryWithIntl(props: ErrorBoundaryProps) {
  const t = useTranslations('Error');
  return <ErrorBoundaryClass {...props} t={t} />;
}

class ErrorBoundaryClass extends React.Component<
  ErrorBoundaryProps & { t: (key: string) => string },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center min-h-[50vh] p-8">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">{t('error_heading')}</h2>
              <p className="text-gray-500 text-sm">{this.state.error?.message}</p>
              <button
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium transition-colors hover:bg-blue-700"
                onClick={() => window.location.reload()}
              >
                {t('reload_page')}
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
