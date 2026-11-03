/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser key for HERE Maps; restrict it to the allowed origins in the HERE portal. */
  readonly VITE_HERE_API_KEY?: string;
}
