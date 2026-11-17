import { z } from 'zod';

export const rateProposalDecisionSchema = z.object({
  note: z.string().trim().min(3, 'Nhập ít nhất 3 ký tự.').max(500, 'Tối đa 500 ký tự.'),
});

export type RateProposalDecisionForm = z.infer<typeof rateProposalDecisionSchema>;
