import { z } from 'zod';

export const asnScanSchema = z.object({ code: z.string().trim().min(1).max(100) });
