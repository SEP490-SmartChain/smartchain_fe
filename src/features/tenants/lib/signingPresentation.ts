/** Hosted signing pages cannot navigate an iframe back to a local/private origin. */
export function shouldUseSigningWindow(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return (
      protocol !== 'https:' ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.includes(':') ||
      /^[\d.]+$/.test(hostname)
    );
  } catch {
    return true;
  }
}
