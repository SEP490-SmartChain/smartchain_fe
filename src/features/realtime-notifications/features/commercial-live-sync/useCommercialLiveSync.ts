import { useCallback, useEffect, useRef, useState } from 'react';

import {
  INITIAL_COMMERCIAL_LIVE_STATE,
  extractCommercialEffects,
  reduceCommercialLiveState,
  type CommercialLiveState,
} from './commercialLiveReducer';
import {
  REALTIME_SYNC_AREAS,
  type RealtimeUiSyncPayload,
  type RealtimeUiSyncResource,
} from '../../shared';

export const COMMERCIAL_LIVE_SYNC_AREAS: readonly RealtimeUiSyncResource[] = [
  REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING,
  REALTIME_SYNC_AREAS.COMMERCIAL_BILLING,
  REALTIME_SYNC_AREAS.COMMERCIAL_UNMATCHED,
  REALTIME_SYNC_AREAS.AUTH_PROFILE,
];

export interface CommercialLiveCallbacks {
  readonly onRefetchCommercial?: () => void | Promise<void>;
  readonly onRefreshUser?: () => void | Promise<void>;
  readonly onRefetchUnmatched?: () => void | Promise<void>;
  readonly onSigningCompleted?: () => void;
}

export interface UseCommercialLiveSyncOptions extends CommercialLiveCallbacks {
  readonly subscribeUiSync?: (
    areas: readonly RealtimeUiSyncResource[],
    handler: (sync: RealtimeUiSyncPayload) => void,
  ) => () => void;
}

export interface UseCommercialLiveSyncResult {
  readonly state: CommercialLiveState;
  readonly applyUiSync: (uiSync: RealtimeUiSyncPayload) => void;
  readonly resetLiveState: () => void;
  readonly isPaymentLiveConfirmed: boolean;
  readonly isServiceLiveActivated: boolean;
  readonly shouldHideQr: boolean;
  readonly shouldCloseSigningModal: boolean;
}

export interface CommercialEffectDispatcher {
  readonly dispatch: (uiSync: RealtimeUiSyncPayload) => void;
  readonly reset: () => void;
}

interface AsyncRunnerState {
  inFlight: boolean;
  queued: boolean;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function invokeCoalescedCallback(
  runner: AsyncRunnerState,
  getCallback: () => (() => void | Promise<void>) | undefined,
  isMounted: () => boolean,
): void {
  const callback = getCallback();
  if (!callback) {
    return;
  }
  if (runner.inFlight) {
    runner.queued = true;
    return;
  }

  runner.inFlight = true;
  let result: void | Promise<void>;
  try {
    result = callback();
  } catch {
    runner.inFlight = false;
    runner.queued = false;
    return;
  }

  if (isPromiseLike(result)) {
    void Promise.resolve(result)
      .catch(() => undefined)
      .finally(() => {
        runner.inFlight = false;
        if (runner.queued && isMounted()) {
          runner.queued = false;
          invokeCoalescedCallback(runner, getCallback, isMounted);
        } else {
          runner.queued = false;
        }
      });
    return;
  }

  runner.inFlight = false;
  if (runner.queued && isMounted()) {
    runner.queued = false;
    invokeCoalescedCallback(runner, getCallback, isMounted);
  } else {
    runner.queued = false;
  }
}

/**
 * Creates a re-entrancy-safe dispatcher that invokes live sync callbacks via latest getters.
 */
export function createCommercialEffectDispatcher(
  getCallbacks: () => CommercialLiveCallbacks,
  isMounted: () => boolean = () => true,
): CommercialEffectDispatcher {
  const commercialRunner: AsyncRunnerState = { inFlight: false, queued: false };
  const profileRunner: AsyncRunnerState = { inFlight: false, queued: false };
  const unmatchedRunner: AsyncRunnerState = { inFlight: false, queued: false };

  return {
    dispatch: (uiSync: RealtimeUiSyncPayload) => {
      const effects = extractCommercialEffects(uiSync);
      if (effects.closeSigningModal) {
        getCallbacks().onSigningCompleted?.();
      }
      if (effects.refetchCommercial) {
        invokeCoalescedCallback(
          commercialRunner,
          () => getCallbacks().onRefetchCommercial,
          isMounted,
        );
      }
      if (effects.refreshProfile) {
        invokeCoalescedCallback(profileRunner, () => getCallbacks().onRefreshUser, isMounted);
      }
      if (effects.refetchUnmatched) {
        invokeCoalescedCallback(
          unmatchedRunner,
          () => getCallbacks().onRefetchUnmatched,
          isMounted,
        );
      }
    },
    reset: () => {
      commercialRunner.queued = false;
      profileRunner.queued = false;
      unmatchedRunner.queued = false;
    },
  };
}

/**
 * Coordinates zero-reload commercial onboarding, SePay payment, and auth profile refreshes.
 */
export function useCommercialLiveSync(
  options: UseCommercialLiveSyncOptions = {},
): UseCommercialLiveSyncResult {
  const {
    subscribeUiSync,
    onRefetchCommercial,
    onRefreshUser,
    onRefetchUnmatched,
    onSigningCompleted,
  } = options;

  const [state, setState] = useState<CommercialLiveState>(INITIAL_COMMERCIAL_LIVE_STATE);
  const mountedRef = useRef(true);
  const callbacksRef = useRef<CommercialLiveCallbacks>({
    onRefetchCommercial,
    onRefreshUser,
    onRefetchUnmatched,
    onSigningCompleted,
  });
  const dispatcherRef = useRef<CommercialEffectDispatcher | null>(null);
  const getDispatcher = useCallback(() => {
    if (dispatcherRef.current === null) {
      dispatcherRef.current = createCommercialEffectDispatcher(
        () => callbacksRef.current,
        () => mountedRef.current,
      );
    }
    return dispatcherRef.current;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onRefetchCommercial,
      onRefreshUser,
      onRefetchUnmatched,
      onSigningCompleted,
    };
  }, [onRefetchCommercial, onRefreshUser, onRefetchUnmatched, onSigningCompleted]);

  const applyUiSync = useCallback(
    (uiSync: RealtimeUiSyncPayload) => {
      // Pure reducer stays side-effect free so React StrictMode double-invocations stay safe.
      setState((prev) => reduceCommercialLiveState(prev, uiSync));
      getDispatcher().dispatch(uiSync);
    },
    [getDispatcher],
  );

  useEffect(() => {
    if (!subscribeUiSync) {
      return undefined;
    }
    return subscribeUiSync(COMMERCIAL_LIVE_SYNC_AREAS, applyUiSync);
  }, [subscribeUiSync, applyUiSync]);

  const resetLiveState = useCallback(() => {
    setState(INITIAL_COMMERCIAL_LIVE_STATE);
    getDispatcher().reset();
  }, [getDispatcher]);

  const isPaymentLiveConfirmed =
    state.paymentStatus === 'POSTED' || state.paymentStatus === 'ACTIVATED';
  const isServiceLiveActivated =
    state.serviceStatus !== null
      ? state.serviceStatus === 'ACTIVE'
      : state.paymentStatus === 'ACTIVATED';

  return {
    state,
    applyUiSync,
    resetLiveState,
    isPaymentLiveConfirmed,
    isServiceLiveActivated,
    shouldHideQr: isPaymentLiveConfirmed,
    shouldCloseSigningModal: state.shouldCloseSigningModal,
  };
}
