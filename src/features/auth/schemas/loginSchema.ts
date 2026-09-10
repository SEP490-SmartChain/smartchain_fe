import { z } from 'zod';

type Translate = (key: string, values?: Record<string, string | number>) => string;

export const getLoginSchema = (t: Translate) =>
  z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email(t('Validation.invalid_email'))
      .max(254, t('Validation.max_length', { max: 254 })),
    password: z
      .string()
      .min(8, t('Validation.min_length', { min: 8 }))
      .max(128, t('Validation.max_length', { max: 128 })),
    rememberSession: z.boolean(),
    workspaceSlug: z
      .string()
      .trim()
      .max(100, t('Validation.max_length', { max: 100 }))
      .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('Auth.invalidWorkspaceSlug')),
  });

export type LoginFormData = z.infer<ReturnType<typeof getLoginSchema>>;
