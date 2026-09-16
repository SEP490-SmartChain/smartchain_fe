import { z } from 'zod';

export const webhookEndpointSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  url: z.string().url(),
  secret: z.string().optional(),
  maskedSecret: z.string().nullable().optional(),
  hasSecret: z.boolean().default(true),
  eventTypes: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const webhookTestResultSchema = z.object({
  success: z.boolean(),
  statusCode: z.number().optional(),
  responseTimeMs: z.number().optional(),
  message: z.string(),
  error: z.string().optional(),
});

export const createWebhookFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, { message: 'urlRequired' })
    .url({ message: 'urlInvalid' })
    .refine((val) => val.startsWith('https://'), {
      message: 'urlMustBeHttps',
    }),
  eventTypes: z
    .array(z.string())
    .min(1, { message: 'atLeastOneEventRequired' }),
  secret: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^whsec_[A-Za-z0-9_-]{32,}$/.test(val),
      {
        message: 'secretInvalidFormat',
      },
    ),
  isActive: z.boolean(),
});

export type CreateWebhookFormData = z.infer<typeof createWebhookFormSchema>;

export const updateWebhookFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, { message: 'urlRequired' })
    .url({ message: 'urlInvalid' })
    .refine((val) => val.startsWith('https://'), {
      message: 'urlMustBeHttps',
    })
    .optional(),
  eventTypes: z
    .array(z.string())
    .min(1, { message: 'atLeastOneEventRequired' })
    .optional(),
  secret: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^whsec_[A-Za-z0-9_-]{32,}$/.test(val),
      {
        message: 'secretInvalidFormat',
      },
    ),
  isActive: z.boolean().optional(),
});

export type UpdateWebhookFormData = z.infer<typeof updateWebhookFormSchema>;
