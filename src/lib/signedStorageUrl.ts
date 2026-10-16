const loopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
export const STORAGE_PROXY_PATH = '/__private-storage';

/** Development proxy preserves the signed storage Host/path; production keeps direct HTTPS URLs. */
export function signedStorageUrl(
  value: string,
  development = import.meta.env.DEV,
  pageOrigin = typeof window === 'undefined' ? undefined : window.location.origin,
  storageTarget = import.meta.env.VITE_STORAGE_TARGET || 'http://localhost:9000',
): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname)))
  ) {
    throw new Error('Invalid private storage URL');
  }
  if (
    development &&
    pageOrigin &&
    url.origin === new URL(storageTarget).origin &&
    loopback(url.hostname)
  ) {
    return `${new URL(pageOrigin).origin}${STORAGE_PROXY_PATH}${url.pathname}${url.search}`;
  }
  return value;
}
