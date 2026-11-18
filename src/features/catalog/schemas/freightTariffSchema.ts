import { z } from 'zod';

/** A carrier service ORCA can quote through the carrier API. */
export const tariffServiceSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  volumetricDivisor: z.number().int().positive(),
  carrier: z.object({ name: z.string(), code: z.string() }),
});
export type TariffService = z.infer<typeof tariffServiceSchema>;
