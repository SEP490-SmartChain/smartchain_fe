import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

const acceptedStaffSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  status: z.literal('ACTIVE'),
  roles: z.array(z.literal('SELLER_STAFF')).length(1),
});

export function readInvitationToken(search: string): string | null {
  const values = new URLSearchParams(search).getAll('token');
  const token = values.length === 1 ? values[0] : undefined;
  return token && token.length <= 512 && token.trim() === token ? token : null;
}

export async function acceptStaffInvitation(
  token: string,
  newPassword: string,
  signal?: AbortSignal,
) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    '/v1/iam/users/accept-invitation',
    { token, newPassword },
    { requiresAuth: false, silent: true, signal },
  );
  return acceptedStaffSchema.parse(data);
}
