import { useTranslations } from 'next-intl';

import AuthPageShell from '@/components/layout/AuthPageShell';
import { AcceptStaffInvitationForm } from '@/features/auth';

export default function AcceptInvitationPage() {
  const t = useTranslations('Auth');
  return (
    <AuthPageShell heading={t('inviteHeading')} subheading={t('inviteSubheading')}>
      <AcceptStaffInvitationForm />
    </AuthPageShell>
  );
}
