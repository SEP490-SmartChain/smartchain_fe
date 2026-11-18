import { GoogleLoginFlow } from './components/GoogleLoginFlow';
import { useGoogleLogin } from './hooks/useGoogleLogin';
import { GOOGLE_WORKSPACE_REQUIRED_CODE, executeGoogleLogin } from './lib/executeGoogleLogin';
import { resolveGoogleLoginOutcome } from './lib/resolveGoogleLoginOutcome';

export { GoogleLoginFlow };
export type { GoogleLoginFlowProps } from './components/GoogleLoginFlow';

export { useGoogleLogin };
export type { UseGoogleLoginOptions, UseGoogleLoginResult } from './hooks/useGoogleLogin';

export { resolveGoogleLoginOutcome };
export type { ResolvedGoogleLoginOutcome } from './lib/resolveGoogleLoginOutcome';

export { GOOGLE_WORKSPACE_REQUIRED_CODE, executeGoogleLogin };
export type { ExecuteGoogleLoginInput, GoogleLoginNavigator } from './lib/executeGoogleLogin';

export const C08_COMPONENTS = [GoogleLoginFlow] as const;

export const C08_HOOKS = [useGoogleLogin] as const;
