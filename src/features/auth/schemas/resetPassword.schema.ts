import { z } from 'zod';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])\S+$/;

export const getResetPasswordSchema = (t: Translate) =>
  z
    .object({
      newPassword: z
        .string()
        .min(8, t('Validation.min_length', { min: 8 }))
        .max(128, t('Validation.max_length', { max: 128 }))
        .regex(PASSWORD_COMPLEXITY, t('Validation.invalid_password_format')),
      confirmPassword: z.string().min(1, t('Validation.required')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('Validation.password_mismatch'),
      path: ['confirmPassword'],
    });

export type ResetPasswordFormData = z.infer<ReturnType<typeof getResetPasswordSchema>>;
