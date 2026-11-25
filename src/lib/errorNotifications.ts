import { toast } from 'sonner';

import { useLocaleStore } from '@/stores/localeStore';

import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

const VALIDATION_TOAST_ID = 'form-validation-error';

function messages() {
  return (useLocaleStore.getState().locale === 'en' ? en : vi).Notifications;
}

export function notifyInvalidForm(): void {
  const copy = messages();
  toast.error(copy.validationTitle, {
    id: VALIDATION_TOAST_ID,
    description: copy.validationHint,
  });
}

export function notifyInlineError(message: string | undefined, compact: boolean): void {
  const title = message?.trim() || messages().errorHint;
  const alreadyVisible = toast
    .getToasts()
    .some(
      (item) =>
        (compact && item.id === VALIDATION_TOAST_ID) ||
        ('type' in item && item.type === 'error' && item.title === title),
    );
  if (!alreadyVisible) toast.error(title);
}
