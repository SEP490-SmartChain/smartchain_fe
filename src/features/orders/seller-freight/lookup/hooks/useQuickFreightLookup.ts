import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EstimateClient, EstimateInput, Tier } from '../../shared';
import { freightEstimateApi } from '../api/freightEstimateApi';
import {
  QuickLookupController,
  createQuickLookupState,
  isQuickResultFresh,
  type QuickLookupState,
} from '../model/quickLookupController';

export function useQuickFreightLookup(options: {
  readonly scope: string;
  readonly isOpen: boolean;
  readonly enabled: boolean;
  readonly client?: EstimateClient;
}) {
  const client = options.client ?? freightEstimateApi;
  const controllerRef = useRef<QuickLookupController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new QuickLookupController(client, options.scope);
  }
  const [state, setState] = useState<QuickLookupState>(() => createQuickLookupState(options.scope));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    setState(ctrl.getState());
    return ctrl.subscribe(setState);
  }, []);

  useEffect(() => {
    controllerRef.current?.resetScope(options.scope);
  }, [options.scope]);

  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (!options.isOpen || !options.enabled) {
      ctrl.cancelInFlight();
      return;
    }
    if (ctrl.getState().originsStatus === 'IDLE') {
      void ctrl.loadOrigins();
    }
  }, [options.isOpen, options.enabled]);

  useEffect(() => {
    if (!state.result) return;
    const expiresAt = Date.parse(state.result.refreshAfter);
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setNowMs(Date.now());
      return;
    }
    const timer = setTimeout(() => setNowMs(Date.now()), remaining + 25);
    return () => clearTimeout(timer);
  }, [state.result]);

  useEffect(() => () => controllerRef.current?.cancelInFlight(), []);

  const reloadOrigins = useCallback(() => {
    void controllerRef.current?.loadOrigins();
  }, []);

  const setSelectedOrigin = useCallback((originId: string) => {
    controllerRef.current?.setSelectedOrigin(originId);
  }, []);

  const setSelectedTier = useCallback((tier: Tier) => {
    controllerRef.current?.setSelectedTier(tier);
  }, []);

  const runEstimate = useCallback(async (input: EstimateInput) => {
    await controllerRef.current?.estimate(input);
    setNowMs(Date.now());
  }, []);

  const cancelInFlight = useCallback(() => {
    controllerRef.current?.cancelInFlight();
  }, []);

  return useMemo(
    () => ({
      state,
      nowMs,
      reloadOrigins,
      setSelectedOrigin,
      setSelectedTier,
      runEstimate,
      cancelInFlight,
      checkFreshness: (currentInput: EstimateInput | null) =>
        isQuickResultFresh(state, currentInput, nowMs),
    }),
    [state, nowMs, reloadOrigins, setSelectedOrigin, setSelectedTier, runEstimate, cancelInFlight],
  );
}
