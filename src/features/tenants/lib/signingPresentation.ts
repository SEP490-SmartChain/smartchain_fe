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

interface SigningPopup {
  opener: unknown;
  location: { replace(url: string): void };
  close(): void;
}

/** Reserve the popup during the click, before the authenticated link request awaits. */
export async function launchSigningSession(
  openPopup: (() => SigningPopup | null) | undefined,
  loadSession: () => Promise<{ signingUrl: string }>,
  isCurrent: () => boolean,
): Promise<{ signingUrl: string; popupBlocked: boolean } | null> {
  let popup: SigningPopup | null = null;
  if (openPopup) {
    try {
      popup = openPopup();
      if (popup) popup.opener = null;
    } catch {
      popup?.close();
      popup = null;
    }
  }
  try {
    const session = await loadSession();
    if (!isCurrent()) {
      popup?.close();
      return null;
    }
    if (popup) {
      try {
        popup.location.replace(session.signingUrl);
      } catch {
        popup.close();
        popup = null;
      }
    }
    return { signingUrl: session.signingUrl, popupBlocked: !!openPopup && !popup };
  } catch (error) {
    popup?.close();
    throw error;
  }
}
