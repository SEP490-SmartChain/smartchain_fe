import React from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
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

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center min-h-[50vh] p-8">
            <Alert variant="error" title={t('error_heading')} className="w-full max-w-md">
              <p className="m-0">{t('reload_hint')}</p>
              <Button className="mt-3" onClick={() => window.location.reload()}>
                {t('reload_page')}
              </Button>
            </Alert>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
