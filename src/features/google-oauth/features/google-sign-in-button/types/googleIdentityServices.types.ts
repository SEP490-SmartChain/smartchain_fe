/**
 * Minimal Google Identity Services (GIS) surface used by the ORCA Google sign-in
 * button. Only the members this feature calls are declared; no third-party type
 * package is added to the repository.
 */

export interface GoogleCredentialResponse {
  readonly credential?: string;
  readonly select_by?: string;
}

export interface GoogleIdentityServicesInitializeOptions {
  readonly client_id: string;
  readonly callback: (response: GoogleCredentialResponse) => void;
  readonly auto_select?: boolean;
  readonly cancel_on_tap_outside?: boolean;
  readonly use_fedcm_for_prompt?: boolean;
}

export interface GoogleIdentityServicesRenderOptions {
  readonly type?: 'standard' | 'icon';
  readonly theme?: 'outline' | 'filled_blue' | 'filled_black';
  readonly size?: 'large' | 'medium' | 'small';
  readonly text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  readonly shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  readonly logo_alignment?: 'left' | 'center';
  readonly width?: number;
  readonly locale?: string;
}

export interface GoogleIdentityServicesId {
  initialize(options: GoogleIdentityServicesInitializeOptions): void;
  renderButton(parent: HTMLElement, options: GoogleIdentityServicesRenderOptions): void;
  prompt(): void;
  disableAutoSelect?(): void;
}

export interface GoogleIdentityServices {
  readonly accounts?: {
    readonly id?: GoogleIdentityServicesId;
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export {};
