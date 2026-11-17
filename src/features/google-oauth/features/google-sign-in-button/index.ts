import { GoogleSignInButton } from './components/GoogleSignInButton';
import { useGoogleIdentityServices } from './hooks/useGoogleIdentityServices';

export { GoogleSignInButton };
export type { GoogleSignInButtonProps } from './components/GoogleSignInButton';

export { useGoogleIdentityServices };
export type {
  UseGoogleIdentityServicesOptions,
  UseGoogleIdentityServicesResult,
} from './hooks/useGoogleIdentityServices';

export type { GoogleIdentityServicesError } from './lib/googleIdentityServices';

export const C07_COMPONENTS = [GoogleSignInButton] as const;

export const C07_HOOKS = [useGoogleIdentityServices] as const;
