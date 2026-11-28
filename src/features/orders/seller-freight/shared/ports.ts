import type {
  EstimateInput,
  EstimateResult,
  OrderFreightRow,
  OrderLookupItem,
  Origin,
} from './schema';

export interface EstimateClient {
  origins(signal: AbortSignal): Promise<Origin[]>;
  estimate(input: EstimateInput, signal: AbortSignal): Promise<EstimateResult>;
}

export interface OrderFreightClient extends EstimateClient {
  orderStatus(orderIds: readonly string[], signal: AbortSignal): Promise<OrderFreightRow[]>;
  orderLookup(items: readonly OrderLookupItem[], signal: AbortSignal): Promise<OrderFreightRow[]>;
}
