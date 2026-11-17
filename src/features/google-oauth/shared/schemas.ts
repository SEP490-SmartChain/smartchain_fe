import { z } from 'zod';

const VN_PHONE_REGEX = /^(0|\+84)[35789][0-9]{8}$/;
const VN_TAX_ID_REGEX = /^\d{10}(-\d{3})?$/;

export const googleLoginRequestSchema = z.object({
  idToken: z.string().trim().min(10, 'Google ID token is required'),
  workspaceSlug: z.string().trim().optional(),
  rememberSession: z.boolean().optional(),
});

export const googleOnboardingRegisterSchema = z.object({
  onboardingToken: z.string().trim().min(10, 'Onboarding token is required'),
  email: z.string().trim().email('Invalid email'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters'),
  phone: z.string().trim().regex(VN_PHONE_REGEX, 'Invalid Vietnamese phone number'),
  taxId: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || VN_TAX_ID_REGEX.test(val), 'Tax ID must be 10 or 13 digits'),
  companyName: z
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(150, 'Company name must not exceed 150 characters'),
  agreeToTerms: z.literal(true, {
    error: 'You must agree to the terms of service',
  }),
});

export type GoogleOnboardingFormData = z.infer<typeof googleOnboardingRegisterSchema>;
