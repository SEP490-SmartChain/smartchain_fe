import { z } from 'zod';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export const getForgotPasswordSchema = (t: Translate) =>
  z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email(t('Validation.invalid_email'))
      .max(254, t('Validation.max_length', { max: 254 })),
  });

export type ForgotPasswordFormData = z.infer<ReturnType<typeof getForgotPasswordSchema>>;
