import { z } from 'zod';

import { buildPublicApiUrl } from '@/lib/publicApiUrl';

/**
 * Origin carriers call back on, without manual entry. Production uses the configured public API
 * address (`VITE_PUBLIC_API_URL`, shared with API key connection info); otherwise the API URL the
 * frontend already calls, where a relative value (dev proxy, same-domain deploy) is the page origin.
 */
export function webhookPublicOrigin(
  publicApiUrl: unknown = import.meta.env.VITE_PUBLIC_API_URL,
  apiUrl: string | undefined = import.meta.env.VITE_API_URL,
  pageOrigin: string = globalThis.location?.origin ?? '',
): string {
  const configured = buildPublicApiUrl('', publicApiUrl);
  if (configured) return new URL(configured).origin;
  try {
    return new URL(apiUrl || '/', pageOrigin).origin;
  } catch {
    return pageOrigin;
  }
}

export const carrierWebhookSchema = (
  hasToken: boolean,
  messages: { invalidToken: string; tokenRequired: string },
) =>
  z
    .object({
      token: z.string().regex(/^(?:[A-Za-z0-9_-]{32,128})?$/, messages.invalidToken),
      status: z.enum(['enabled', 'disabled']),
    })
    .superRefine((value, context) => {
      if (value.status === 'enabled' && !hasToken && !value.token) {
        context.addIssue({ code: 'custom', path: ['token'], message: messages.tokenRequired });
      }
    });

export function carrierCallbackUrl(
  baseUrl: string,
  carrier: 'GHN' | 'GHTK' | 'VIETTEL_POST',
  token?: string,
): string {
  const url = new URL(`/api/v1/webhooks/carriers/${carrier}`, baseUrl);
  if (carrier === 'GHTK' && token) url.searchParams.set('hash', token);
  return url.toString();
}
