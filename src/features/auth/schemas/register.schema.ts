import { z } from 'zod';

export const getRegisterSchema = (t: any) =>
  z
    .object({
      fullName: z
        .string()
        .min(2, t('Validation.min_length', { min: 2 }))
        .max(100, t('Validation.max_length', { max: 100 }))
        .regex(/^[a-zA-ZÀ-ỹ\s]+$/, t('Validation.only_letters_spaces')),
      email: z
        .string()
        .email(t('Validation.invalid_email'))
        .max(255, t('Validation.max_length', { max: 255 })),
      phone: z
        .string()
        .regex(/^0[0-9]{9}$/, t('Validation.invalid_phone')),
      companyName: z
        .string()
        .min(3, t('Validation.min_length', { min: 3 }))
        .max(255, t('Validation.max_length', { max: 255 })),
      taxId: z
        .string()
        .regex(/^[0-9]{10}$|^[0-9]{14}$/, t('Validation.invalid_tax_id'))
        .optional()
        .or(z.literal('')),
      password: z
        .string()
        .min(8, t('Validation.min_length', { min: 8 }))
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])\S+$/,
          t('Validation.invalid_password_format'),
        ),
      confirmPassword: z.string().min(1, t('Validation.required')),
      agreeToTerms: z.boolean().refine((val) => val === true, {
        message: t('Validation.must_agree_terms'),
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('Validation.password_mismatch'),
      path: ['confirmPassword'],
    });

export type RegisterFormData = z.infer<ReturnType<typeof getRegisterSchema>>;
