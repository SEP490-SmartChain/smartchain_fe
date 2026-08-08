import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(100),
  email: z.string().email({ message: 'Please enter a valid email address' }),
  dob: z.string().regex(/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, {
    message: 'Date of Birth must be MM/DD/YYYY',
  }),
  status: z.enum(['Approved', 'Blocked', 'Rejected']),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
