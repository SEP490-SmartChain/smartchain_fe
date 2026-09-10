import React from 'react';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/Common';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export function ErrorBoundaryWithIntl(props: ErrorBoundaryProps) {
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
              <Button className="mt-4" onClick={() => window.location.reload()}>
                {t('reload_page')}
              </Button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
