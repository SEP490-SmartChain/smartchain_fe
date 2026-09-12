import { ArrowRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Card, CardContent, CardHeader } from '@/components/Common';

import ComponentPageShell from './ComponentPageShell';

export default function ButtonsPage() {
  const t = useTranslations('Components');

  return (
    <ComponentPageShell title={t('buttonVariants')}>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('buttonVariants')} description={t('buttonVariantsDescription')} />
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="primary">
              {t('primary')}
            </Button>
            <Button type="button" variant="secondary">
              {t('secondary')}
            </Button>
            <Button type="button" variant="outline">
              {t('outline')}
            </Button>
            <Button type="button" variant="danger">
              {t('danger')}
            </Button>
            <Button type="button" variant="ghost">
              {t('ghost')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t('buttonSizes')} description={t('buttonSizesDescription')} />
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm">
              {t('small')}
            </Button>
            <Button type="button" size="md">
              {t('medium')}
            </Button>
            <Button type="button" size="lg">
              {t('large')}
            </Button>
            <Button type="button" isLoading>
              {t('loading')}
            </Button>
            <Button type="button" disabled>
              {t('disabled')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('withIcon')} description={t('buttonVariantsDescription')} />
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button">
            <Plus size={16} />
            {t('withIcon')}
          </Button>
          <Button type="button" variant="outline">
            {t('view')}
            <ArrowRight size={16} />
          </Button>
        </CardContent>
      </Card>
    </ComponentPageShell>
  );
}
