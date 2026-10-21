import { z } from 'zod';

import { apiClient, type ApiResponse } from '@/services/apiClient';

import { binSchema, zoneSchema, type Bin, type Zone } from './warehouseLayoutApi';
import {
  saveVisualLayoutSchema,
  visualLayoutSchema,
  type VisualPlan,
} from '../schemas/warehouseVisualLayoutSchema';

const base = (id: string) => `/v1/warehouses/${encodeURIComponent(id)}`;
const pagination = z.object({ hasNext: z.boolean(), nextCursor: z.string().nullable() });
export const warehouseVisualLayoutApi = {
  async read(id: string, signal?: AbortSignal) {
    const { data } = await apiClient.get<ApiResponse<unknown>>(`${base(id)}/visual-layout`, {
      signal,
      silent: true,
    });
    return visualLayoutSchema.parse(data);
  },
  async save(id: string, expectedRevision: number, plan: VisualPlan, signal?: AbortSignal) {
    const body = saveVisualLayoutSchema.parse({ expectedRevision, plan });
    const { data } = await apiClient.post<ApiResponse<unknown>>(`${base(id)}/visual-layout`, body, {
      signal,
      silent: true,
    });
    return visualLayoutSchema.parse(data);
  },
  async catalog(id: string, signal: AbortSignal): Promise<{ zones: Zone[]; bins: Bin[] }> {
    const zones: Zone[] = [],
      bins: Bin[] = [];
    async function pages<T>(
      path: string,
      schema: z.ZodType<T>,
      target: T[],
      limit: number,
      zoneId?: string,
    ) {
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        signal.throwIfAborted();
        const result: ApiResponse<unknown> = await apiClient.get(`${base(id)}/${path}`, {
          params: { limit: '100', ...(cursor ? { cursor } : {}), ...(zoneId ? { zoneId } : {}) },
          signal,
          silent: true,
        });
        target.push(...z.array(schema).parse(result.data));
        if (target.length > limit) throw new Error('VISUAL_LAYOUT_LIMIT');
        const page = pagination.parse(result.meta.pagination);
        if (!page.hasNext) break;
        if (!page.nextCursor || seen.has(page.nextCursor)) {
          throw new Error('VISUAL_LAYOUT_PAGINATION');
        }
        seen.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (cursor);
    }
    await pages('zones', zoneSchema, zones, 100);
    if (
      new Set(zones.map((zone) => zone.id)).size !== zones.length ||
      zones.some((zone) => zone.warehouseId !== id)
    ) {
      throw new Error('VISUAL_LAYOUT_SCOPE');
    }
    for (let index = 0; index < zones.length; index += 4) {
      await Promise.all(
        zones.slice(index, index + 4).map((zone) => pages('bins', binSchema, bins, 1000, zone.id)),
      );
    }
    if (
      new Set(zones.map((zone) => zone.id)).size !== zones.length ||
      new Set(bins.map((bin) => bin.id)).size !== bins.length ||
      zones.some((zone) => zone.warehouseId !== id) ||
      bins.some((bin) => bin.warehouseId !== id || !zones.some((zone) => zone.id === bin.zoneId))
    ) {
      throw new Error('VISUAL_LAYOUT_SCOPE');
    }
    return { zones, bins };
  },
};
