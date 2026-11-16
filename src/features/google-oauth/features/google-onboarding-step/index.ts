import { GoogleOnboardingStep } from './components/GoogleOnboardingStep';
import { useGoogleOnboarding } from './hooks/useGoogleOnboarding';
import { buildGoogleOnboardingDefaults } from './lib/buildGoogleOnboardingDefaults';

export { GoogleOnboardingStep };
export type { GoogleOnboardingStepProps } from './components/GoogleOnboardingStep';

export { useGoogleOnboarding };
export type {
  UseGoogleOnboardingOptions,
  UseGoogleOnboardingResult,
} from './hooks/useGoogleOnboarding';

export { buildGoogleOnboardingDefaults };
export type { GoogleOnboardingDefaults } from './lib/buildGoogleOnboardingDefaults';

export const C09_COMPONENTS = [GoogleOnboardingStep] as const;

export const C09_HOOKS = [useGoogleOnboarding] as const;
