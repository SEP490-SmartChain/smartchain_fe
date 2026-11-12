import { z } from 'zod';

export function createStaffInvitationSchema(messages: {
  nameLength: string;
  emailInvalid: string;
}) {
  return z.object({
    fullName: z.string().trim().min(2, messages.nameLength).max(100, messages.nameLength),
    email: z.string().trim().toLowerCase().email(messages.emailInvalid),
  });
}

export type StaffInvitationValues = z.infer<ReturnType<typeof createStaffInvitationSchema>>;
