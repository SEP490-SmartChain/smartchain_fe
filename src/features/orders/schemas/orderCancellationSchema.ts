import { z } from 'zod';
export const cancellationReasonSchema = z.object({ reason: z.string().trim().min(1).max(500) });
