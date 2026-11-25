import { REALTIME_SYNC_AREAS, REALTIME_TOPICS, type RealtimeUiSyncPayload } from '../../shared';

export type CommercialPaymentLiveStatus = 'IDLE' | 'POSTED' | 'ACTIVATED';

export interface CommercialLiveState {
  readonly signingCompleted: boolean;
  readonly shouldCloseSigningModal: boolean;
  readonly paymentStatus: CommercialPaymentLiveStatus;
  readonly serviceStatus: string | null;
  readonly lastInvoiceNumber: string | null;
  readonly lastAmountVnd: number | null;
  readonly lastReceiptId: string | null;
  readonly lastEventAt: string | null;
  readonly needsCommercialRefetch: boolean;
  readonly needsProfileRefresh: boolean;
  readonly needsUnmatchedRefetch: boolean;
}

export interface CommercialLiveEffects {
  readonly closeSigningModal: boolean;
  readonly hidePaymentQr: boolean;
  readonly refetchCommercial: boolean;
  readonly refreshProfile: boolean;
  readonly refetchUnmatched: boolean;
}

export const INITIAL_COMMERCIAL_LIVE_STATE: CommercialLiveState = {
  signingCompleted: false,
  shouldCloseSigningModal: false,
  paymentStatus: 'IDLE',
  serviceStatus: null,
  lastInvoiceNumber: null,
  lastAmountVnd: null,
  lastReceiptId: null,
  lastEventAt: null,
  needsCommercialRefetch: false,
  needsProfileRefresh: false,
  needsUnmatchedRefetch: false,
};

const PAYMENT_POSTED_TOPICS: ReadonlySet<string> = new Set([
  REALTIME_TOPICS.COMMERCIAL_PAYMENT_POSTED,
  'commercial.bank_receipt_posted',
  'commercial.mock_payment_posted',
]);

const SERVICE_STATUS_CHANGE_TOPICS: ReadonlySet<string> = new Set([
  REALTIME_TOPICS.COMMERCIAL_SERVICE_STATUS_CHANGED,
  REALTIME_TOPICS.TENANT_STATUS_CHANGED,
  REALTIME_TOPICS.COMMERCIAL_PLAN_CHANGE_APPLIED,
  REALTIME_TOPICS.COMMERCIAL_CONTRACT_CLOSED,
]);

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function hasCommercialSyncArea(uiSync: RealtimeUiSyncPayload): boolean {
  return (
    uiSync.syncAreas.includes(REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING) ||
    uiSync.syncAreas.includes(REALTIME_SYNC_AREAS.COMMERCIAL_BILLING)
  );
}

function isSigningCompletedEvent(uiSync: RealtimeUiSyncPayload): boolean {
  return (
    uiSync.topic === REALTIME_TOPICS.COMMERCIAL_CONTRACT_SIGNED ||
    uiSync.meta?.shouldCloseSigningModal === true
  );
}

function isPaymentPostedEvent(uiSync: RealtimeUiSyncPayload): boolean {
  return PAYMENT_POSTED_TOPICS.has(uiSync.topic);
}

function isServiceActivatedEvent(uiSync: RealtimeUiSyncPayload): boolean {
  return (
    uiSync.topic === REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED ||
    (uiSync.syncAreas.includes(REALTIME_SYNC_AREAS.AUTH_PROFILE) && uiSync.status === 'ACTIVE')
  );
}

function isUnmatchedEvent(uiSync: RealtimeUiSyncPayload): boolean {
  return (
    uiSync.topic === REALTIME_TOPICS.SEPAY_UNMATCHED_RECEIVED ||
    uiSync.syncAreas.includes(REALTIME_SYNC_AREAS.COMMERCIAL_UNMATCHED)
  );
}

/**
 * Extracts the declarative zero-reload UI side effects implied by a realtime `ui_sync` payload.
 */
export function extractCommercialEffects(uiSync: RealtimeUiSyncPayload): CommercialLiveEffects {
  const closeSigningModal = isSigningCompletedEvent(uiSync);
  const paymentPosted = isPaymentPostedEvent(uiSync);
  const serviceActivated = isServiceActivatedEvent(uiSync);
  const unmatched = isUnmatchedEvent(uiSync);
  const statusLifecycleChanged = SERVICE_STATUS_CHANGE_TOPICS.has(uiSync.topic);
  const profileAreaIncluded =
    uiSync.syncAreas.includes(REALTIME_SYNC_AREAS.AUTH_PROFILE) ||
    uiSync.meta?.refreshProfile === true;

  return {
    closeSigningModal,
    hidePaymentQr: paymentPosted || serviceActivated,
    refetchCommercial:
      closeSigningModal ||
      paymentPosted ||
      serviceActivated ||
      statusLifecycleChanged ||
      hasCommercialSyncArea(uiSync),
    refreshProfile: serviceActivated || statusLifecycleChanged || profileAreaIncluded,
    refetchUnmatched: paymentPosted || unmatched,
  };
}

/**
 * Pure state machine reducing Flow 10 SignNow, SePay, and commercial activation `ui_sync` events.
 */
export function reduceCommercialLiveState(
  state: CommercialLiveState,
  uiSync: RealtimeUiSyncPayload,
): CommercialLiveState {
  const effects = extractCommercialEffects(uiSync);
  const hasAnyEffect =
    effects.closeSigningModal ||
    effects.hidePaymentQr ||
    effects.refetchCommercial ||
    effects.refreshProfile ||
    effects.refetchUnmatched;

  if (!hasAnyEffect) {
    return state;
  }

  const paymentPosted = isPaymentPostedEvent(uiSync);
  const serviceActivated = isServiceActivatedEvent(uiSync);
  const statusLifecycleChanged = SERVICE_STATUS_CHANGE_TOPICS.has(uiSync.topic);

  let nextPaymentStatus: CommercialPaymentLiveStatus = state.paymentStatus;
  if (serviceActivated) {
    nextPaymentStatus = 'ACTIVATED';
  } else if (paymentPosted) {
    nextPaymentStatus = state.paymentStatus === 'ACTIVATED' ? 'ACTIVATED' : 'POSTED';
  }

  let nextServiceStatus: string | null = state.serviceStatus;
  if (serviceActivated) {
    nextServiceStatus = 'ACTIVE';
  } else if (statusLifecycleChanged) {
    nextServiceStatus =
      readNonEmptyString(uiSync.meta?.serviceStatus) ??
      readNonEmptyString(uiSync.status) ??
      state.serviceStatus;
  }

  const nextInvoiceNumber =
    readNonEmptyString(uiSync.meta?.invoiceNumber) ?? state.lastInvoiceNumber;
  const nextAmountVnd = readFiniteNumber(uiSync.meta?.amountVnd) ?? state.lastAmountVnd;
  const nextReceiptId = readNonEmptyString(uiSync.meta?.receiptId) ?? state.lastReceiptId;
  const nextEventAt = readNonEmptyString(uiSync.occurredAt) ?? state.lastEventAt;

  return {
    signingCompleted: state.signingCompleted || effects.closeSigningModal,
    shouldCloseSigningModal: state.shouldCloseSigningModal || effects.closeSigningModal,
    paymentStatus: nextPaymentStatus,
    serviceStatus: nextServiceStatus,
    lastInvoiceNumber: nextInvoiceNumber,
    lastAmountVnd: nextAmountVnd,
    lastReceiptId: nextReceiptId,
    lastEventAt: nextEventAt,
    needsCommercialRefetch: state.needsCommercialRefetch || effects.refetchCommercial,
    needsProfileRefresh: state.needsProfileRefresh || effects.refreshProfile,
    needsUnmatchedRefetch: state.needsUnmatchedRefetch || effects.refetchUnmatched,
  };
}
