import { z } from 'zod';

export const AUTHORITY_OPTIONS = ['owner', 'legalRepresentative', 'authorized'] as const;

const PLACEHOLDER_TEXT = /^(?:([\p{L}\p{N}])\1+|abc123|abcxyz|test|asdf|qwerty|nhậpđại|nhapdai)$/u;

function hasValidContent(value: string): boolean {
  const compact = value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return !/\p{Cc}/u.test(value) && !PLACEHOLDER_TEXT.test(compact);
}

export function contractBusinessProfileSchema(required: boolean) {
  const text = (min: number, max: number) =>
    z
      .string()
      .trim()
      .min(required ? min : 0)
      .max(max)
      .refine((value) => (!required && !value) || (/\p{L}/u.test(value) && hasValidContent(value)));
  const authorizationReference = z.string().min(5).max(150).regex(/[0-9]/).refine(hasValidContent);
  return z
    .object({
      legalName: text(2, 150),
      address: text(5, 250),
      registrationNumber: z
        .string()
        .trim()
        .regex(/^$|^(?=[A-Za-z0-9-]*[A-Za-z0-9])[A-Za-z0-9-]{3,30}$/),
      representativeName: text(2, 100).refine(
        (value) =>
          (!required && !value) ||
          /^\p{L}[\p{L}\p{M}]*(?:(?:[’'-]|\.? +)\p{L}[\p{L}\p{M}]*)*\.?$/u.test(value),
      ),
      authorityBasis: z.enum(['', ...AUTHORITY_OPTIONS]),
      authorizationReference: z.string().trim(),
      phone: z
        .string()
        .trim()
        .regex(required ? /^\+?[0-9][0-9 ()-]{6,24}$/ : /^$|^\+?[0-9][0-9 ()-]{6,24}$/)
        .transform((value) => value.replace(/[ ()-]/g, ''))
        .refine(
          (value) =>
            (!required && value === '') ||
            (/^\+?\d{7,15}$/.test(value) && !/^\+?(\d)\1+$/.test(value)),
        ),
      hasReviewedTerms: z.boolean().refine((value) => value),
    })
    .superRefine((profile, context) => {
      if (required && !profile.authorityBasis) {
        context.addIssue({ code: 'custom', path: ['authorityBasis'], message: 'Required' });
      }
      if (
        profile.authorityBasis === 'authorized' &&
        !authorizationReference.safeParse(profile.authorizationReference).success
      ) {
        context.addIssue({ code: 'custom', path: ['authorizationReference'], message: 'Invalid' });
      }
    });
}
