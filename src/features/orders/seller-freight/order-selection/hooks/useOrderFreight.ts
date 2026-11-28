import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { OrderFreightClient, OrderLookupItem } from '../../shared';
import { freightEstimateApi } from '../../lookup/api/freightEstimateApi';
import {
  OrderFreightCoordinator,
  createInitialOrderFreightState,
  type OrderFreightStoreState,
} from '../model/orderFreightCoordinator';
import {
  retainOrderSelection,
  toggleOrderSelection,
  toggleVisibleOrderSelection,
} from '../model/orderSelectionState';

export function useOrderFreight(options: {
  readonly scope: string;
  readonly visibleOrderIds: readonly string[];
  readonly client?: Pick<OrderFreightClient, 'orderStatus' | 'orderLookup'>;
}) {
  const client = options.client ?? freightEstimateApi;
  const coordinatorRef = useRef<OrderFreightCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new OrderFreightCoordinator(client, options.scope);
  }
  const [state, setState] = useState<OrderFreightStoreState>(() =>
    createInitialOrderFreightState(options.scope),
  );
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord) return;
    setState(coord.getState());
    return coord.subscribe(setState);
  }, []);

  useEffect(() => {
    coordinatorRef.current?.resetScope(options.scope);
    setSelectedOrderIds(new Set());
  }, [options.scope]);

  useEffect(() => {
    setSelectedOrderIds((prev) => retainOrderSelection(prev, options.visibleOrderIds));
  }, [options.visibleOrderIds]);

  useEffect(() => () => coordinatorRef.current?.cancelInFlight(), []);

  const refreshStatus = useCallback(async (orderIds: readonly string[]) => {
    await coordinatorRef.current?.refreshStatus(orderIds);
  }, []);

  const lookupOrders = useCallback(async (items: readonly OrderLookupItem[]) => {
    await coordinatorRef.current?.lookupOrders(items);
  }, []);

  const toggleOne = useCallback((orderId: string) => {
    setSelectedOrderIds((prev) => toggleOrderSelection(prev, orderId));
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedOrderIds((prev) => toggleVisibleOrderSelection(prev, options.visibleOrderIds));
  }, [options.visibleOrderIds]);

  const clearSelection = useCallback(() => {
    setSelectedOrderIds(new Set());
  }, []);

  return useMemo(
    () => ({
      state,
      selectedOrderIds,
      refreshStatus,
      lookupOrders,
      toggleOne,
      toggleAllVisible,
      clearSelection,
    }),
    [
      state,
      selectedOrderIds,
      refreshStatus,
      lookupOrders,
      toggleOne,
      toggleAllVisible,
      clearSelection,
    ],
  );
}
