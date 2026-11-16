import { GoogleProfileLinkCard } from './components/GoogleProfileLinkCard';
import { useGoogleProfileLink } from './hooks/useGoogleProfileLink';
import {
  GOOGLE_IDENTITY_CONFLICT_CODE,
  GOOGLE_VERSION_CONFLICT_CODE,
  executeGoogleProfileLink,
} from './lib/executeGoogleProfileLink';

export { GoogleProfileLinkCard };
export type { GoogleProfileLinkCardProps } from './components/GoogleProfileLinkCard';

export { useGoogleProfileLink };
export type {
  GoogleProfileLinkError,
  UseGoogleProfileLinkOptions,
  UseGoogleProfileLinkResult,
} from './hooks/useGoogleProfileLink';

export { GOOGLE_IDENTITY_CONFLICT_CODE, GOOGLE_VERSION_CONFLICT_CODE, executeGoogleProfileLink };
export type {
  ExecuteGoogleProfileLinkInput,
  GoogleProfileLinkOutcome,
} from './lib/executeGoogleProfileLink';

export const C10_COMPONENTS = [GoogleProfileLinkCard] as const;

export const C10_HOOKS = [useGoogleProfileLink] as const;
