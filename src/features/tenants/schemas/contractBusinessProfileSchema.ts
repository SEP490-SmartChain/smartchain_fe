import { z } from 'zod';

export function contractBusinessProfileSchema(required: boolean) {
  const text = (min: number, max: number) =>
    z
      .string()
      .trim()
      .min(required ? min : 0)
      .max(max)
      .refine((value) => Array.from(value).every((character) => character.charCodeAt(0) >= 32));
  return z.object({
    legalName: text(2, 150),
    address: text(5, 250),
    registrationNumber: z
      .string()
      .trim()
      .regex(/^$|^[A-Za-z0-9-]{3,30}$/),
    representativeName: text(2, 100),
    representativeTitle: text(2, 80),
    authorityBasis: text(5, 200),
    phone: z
      .string()
      .trim()
      .regex(required ? /^\+?[0-9][0-9 ()-]{6,24}$/ : /^$|^\+?[0-9][0-9 ()-]{6,24}$/),
    hasReviewedTerms: z.boolean().refine((value) => value),
  });
}
