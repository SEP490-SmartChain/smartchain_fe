import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  C09_COMPONENTS,
  C09_HOOKS,
  COMMERCIAL_LIVE_SYNC_AREAS,
  INITIAL_COMMERCIAL_LIVE_STATE,
  LivePaymentSuccessBanner,
  createCommercialEffectDispatcher,
  extractCommercialEffects,
  reduceCommercialLiveState,
  useCommercialLiveSync,
  type CommercialLiveCallbacks,
} from '@/features/realtime-notifications/features/commercial-live-sync';
import {
  CANONICAL_FE_RECEIPT_ID,
  REALTIME_SYNC_AREAS,
  REALTIME_TOPICS,
  makeCommercialContractSignedEvent,
  makeCommercialPaymentPostedEvent,
  makeCommercialServiceActivatedEvent,
  makeSseUiSyncEvent,
} from '@/features/realtime-notifications/shared';

function LiveSyncSsrProbe() {
  const live = useCommercialLiveSync({
    subscribeUiSync: () => () => {},
    onRefetchCommercial: () => {},
    onRefreshUser: () => {},
    onRefetchUnmatched: () => {},
    onSigningCompleted: () => {},
  });

  return createElement(
    'div',
    null,
    [
      live.state.paymentStatus,
      String(live.isPaymentLiveConfirmed),
      String(live.isServiceLiveActivated),
      String(live.shouldHideQr),
      String(live.shouldCloseSigningModal),
    ].join(':'),
  );
}

describe('C09 commercial-live-sync exports', () => {
  test('publishes C09_COMPONENTS, C09_HOOKS, and expected sync areas', () => {
    assert.deepEqual([...C09_COMPONENTS], [LivePaymentSuccessBanner]);
    assert.deepEqual([...C09_HOOKS], [useCommercialLiveSync]);
    assert.deepEqual(
      [...COMMERCIAL_LIVE_SYNC_AREAS],
      [
        REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING,
        REALTIME_SYNC_AREAS.COMMERCIAL_BILLING,
        REALTIME_SYNC_AREAS.COMMERCIAL_UNMATCHED,
        REALTIME_SYNC_AREAS.AUTH_PROFILE,
      ],
    );
  });
});

describe('reduceCommercialLiveState & extractCommercialEffects', () => {
  test('progresses cleanly across Flow 10 zero-reload SignNow + SePay + Activation events', () => {
    const signedEvent = makeCommercialContractSignedEvent();
    assert.ok(signedEvent.uiSync);
    const signedEffects = extractCommercialEffects(signedEvent.uiSync);
    assert.deepEqual(signedEffects, {
      closeSigningModal: true,
      hidePaymentQr: false,
      refetchCommercial: true,
      refreshProfile: false,
      refetchUnmatched: false,
    });

    const afterSign = reduceCommercialLiveState(INITIAL_COMMERCIAL_LIVE_STATE, signedEvent.uiSync);
    assert.equal(afterSign.signingCompleted, true);
    assert.equal(afterSign.shouldCloseSigningModal, true);
    assert.equal(afterSign.needsCommercialRefetch, true);
    assert.equal(afterSign.paymentStatus, 'IDLE');
    assert.equal(afterSign.needsProfileRefresh, false);

    const postedEvent = makeCommercialPaymentPostedEvent();
    assert.ok(postedEvent.uiSync);
    const postedEffects = extractCommercialEffects(postedEvent.uiSync);
    assert.deepEqual(postedEffects, {
      closeSigningModal: false,
      hidePaymentQr: true,
      refetchCommercial: true,
      refreshProfile: false,
      refetchUnmatched: true,
    });

    const afterPosted = reduceCommercialLiveState(afterSign, postedEvent.uiSync);
    assert.equal(afterPosted.signingCompleted, true);
    assert.equal(afterPosted.shouldCloseSigningModal, true);
    assert.equal(afterPosted.paymentStatus, 'POSTED');
    assert.equal(afterPosted.lastInvoiceNumber, 'INV-2026-0001');
    assert.equal(afterPosted.lastAmountVnd, 1500000);
    assert.equal(afterPosted.lastReceiptId, CANONICAL_FE_RECEIPT_ID);
    assert.equal(afterPosted.needsCommercialRefetch, true);
    assert.equal(afterPosted.needsUnmatchedRefetch, true);
    assert.equal(afterPosted.needsProfileRefresh, false);

    const activatedEvent = makeCommercialServiceActivatedEvent();
    assert.ok(activatedEvent.uiSync);
    const activatedEffects = extractCommercialEffects(activatedEvent.uiSync);
    assert.deepEqual(activatedEffects, {
      closeSigningModal: false,
      hidePaymentQr: true,
      refetchCommercial: true,
      refreshProfile: true,
      refetchUnmatched: false,
    });

    const afterActivated = reduceCommercialLiveState(afterPosted, activatedEvent.uiSync);
    assert.equal(afterActivated.paymentStatus, 'ACTIVATED');
    assert.equal(afterActivated.serviceStatus, 'ACTIVE');
    assert.equal(afterActivated.needsCommercialRefetch, true);
    assert.equal(afterActivated.needsProfileRefresh, true);
    assert.equal(afterActivated.lastInvoiceNumber, 'INV-2026-0001');
    assert.equal(afterActivated.lastAmountVnd, 1500000);
    assert.equal(afterActivated.lastReceiptId, CANONICAL_FE_RECEIPT_ID);

    // Out-of-order payment posted must not downgrade an already ACTIVATED state.
    const afterLatePosted = reduceCommercialLiveState(afterActivated, postedEvent.uiSync);
    assert.equal(afterLatePosted.paymentStatus, 'ACTIVATED');
  });

  test('handles sepay.unmatched_received by flagging unmatched refetch only', () => {
    const unmatchedByTopic = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.SEPAY_UNMATCHED_RECEIVED,
      syncAreas: [],
      resourceType: 'sepay_transaction',
      status: 'UNMATCHED',
    }).uiSync;

    assert.deepEqual(extractCommercialEffects(unmatchedByTopic), {
      closeSigningModal: false,
      hidePaymentQr: false,
      refetchCommercial: false,
      refreshProfile: false,
      refetchUnmatched: true,
    });

    const next = reduceCommercialLiveState(INITIAL_COMMERCIAL_LIVE_STATE, unmatchedByTopic);
    assert.equal(next.needsUnmatchedRefetch, true);
    assert.equal(next.needsCommercialRefetch, false);
    assert.equal(next.paymentStatus, 'IDLE');

    const unmatchedByArea = makeSseUiSyncEvent({
      topic: 'custom.reconcile',
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_UNMATCHED],
      resourceType: 'sepay_transaction',
      status: 'UNMATCHED',
    }).uiSync;
    assert.equal(
      reduceCommercialLiveState(INITIAL_COMMERCIAL_LIVE_STATE, unmatchedByArea)
        .needsUnmatchedRefetch,
      true,
    );
  });

  test('handles lifecycle status changes and ignores unrelated warehouse events', () => {
    const suspended = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.COMMERCIAL_SERVICE_STATUS_CHANGED,
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_BILLING, REALTIME_SYNC_AREAS.AUTH_PROFILE],
      resourceType: 'tenant',
      status: 'SUSPENDED',
    }).uiSync;
    const afterSuspended = reduceCommercialLiveState(INITIAL_COMMERCIAL_LIVE_STATE, suspended);
    assert.equal(afterSuspended.serviceStatus, 'SUSPENDED');
    assert.equal(afterSuspended.paymentStatus, 'IDLE');
    assert.equal(afterSuspended.needsCommercialRefetch, true);
    assert.equal(afterSuspended.needsProfileRefresh, true);

    const closed = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.COMMERCIAL_CONTRACT_CLOSED,
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING],
      resourceType: 'contract',
      status: 'CLOSED',
    }).uiSync;
    const afterClosed = reduceCommercialLiveState(afterSuspended, closed);
    assert.equal(afterClosed.serviceStatus, 'CLOSED');
    assert.equal(afterClosed.needsCommercialRefetch, true);
    assert.equal(afterClosed.needsProfileRefresh, true);

    const activeViaAuthArea = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.TENANT_STATUS_CHANGED,
      syncAreas: [REALTIME_SYNC_AREAS.AUTH_PROFILE],
      resourceType: 'tenant',
      status: 'ACTIVE',
    }).uiSync;
    const afterAuthActive = reduceCommercialLiveState(
      INITIAL_COMMERCIAL_LIVE_STATE,
      activeViaAuthArea,
    );
    assert.equal(afterAuthActive.paymentStatus, 'ACTIVATED');
    assert.equal(afterAuthActive.serviceStatus, 'ACTIVE');

    const unrelated = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.ASN_ARRIVED,
      syncAreas: [REALTIME_SYNC_AREAS.INBOUND_ASN],
      resourceType: 'asn',
      status: 'ARRIVED',
    }).uiSync;
    assert.strictEqual(reduceCommercialLiveState(afterAuthActive, unrelated), afterAuthActive);
  });
});

describe('createCommercialEffectDispatcher', () => {
  test('invokes latest callbacks without concurrent double-execution and stops trailing runs on unmount', async () => {
    let signingClosedCount = 0;
    let refetchCommercialCount = 0;
    let refetchUnmatchedCount = 0;
    const refreshLog: string[] = [];
    let releaseFirstRefresh: (() => void) | undefined;
    let mounted = true;

    let currentCallbacks: CommercialLiveCallbacks = {
      onSigningCompleted: () => {
        signingClosedCount += 1;
      },
      onRefetchCommercial: () => {
        refetchCommercialCount += 1;
      },
      onRefetchUnmatched: () => {
        refetchUnmatchedCount += 1;
      },
      onRefreshUser: () =>
        new Promise<void>((resolve) => {
          refreshLog.push('v1');
          releaseFirstRefresh = resolve;
        }),
    };

    const dispatcher = createCommercialEffectDispatcher(
      () => currentCallbacks,
      () => mounted,
    );

    const signed = makeCommercialContractSignedEvent().uiSync;
    const posted = makeCommercialPaymentPostedEvent().uiSync;
    const activated = makeCommercialServiceActivatedEvent().uiSync;
    assert.ok(signed && posted && activated);

    dispatcher.dispatch(signed);
    assert.equal(signingClosedCount, 1);
    assert.equal(refetchCommercialCount, 1);
    assert.equal(refreshLog.length, 0);

    dispatcher.dispatch(posted);
    assert.equal(refetchCommercialCount, 2);
    assert.equal(refetchUnmatchedCount, 1);

    // Trigger back-to-back activations while first async profile refresh is still pending.
    dispatcher.dispatch(activated);
    currentCallbacks = {
      ...currentCallbacks,
      onRefreshUser: () => {
        refreshLog.push('v2');
      },
    };
    dispatcher.dispatch(activated);
    dispatcher.dispatch(activated);

    assert.deepEqual(refreshLog, ['v1']);
    releaseFirstRefresh?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Coalesced trailing run invokes the updated v2 callback exactly once.
    assert.deepEqual(refreshLog, ['v1', 'v2']);

    // Once unmounted, a queued trailing refresh does not fire after cleanup.
    let releaseThirdRefresh: (() => void) | undefined;
    currentCallbacks = {
      ...currentCallbacks,
      onRefreshUser: () =>
        new Promise<void>((resolve) => {
          refreshLog.push('v3');
          releaseThirdRefresh = resolve;
        }),
    };
    dispatcher.dispatch(activated);
    dispatcher.dispatch(activated);
    mounted = false;
    releaseThirdRefresh?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(refreshLog, ['v1', 'v2', 'v3']);
  });
});

describe('LivePaymentSuccessBanner SSR rendering', () => {
  test('renders POSTED state with invoice, formatted VND, receipt ID, role="status", and no CTA when omitted', () => {
    const html = renderToStaticMarkup(
      createElement(LivePaymentSuccessBanner, {
        status: 'POSTED',
        invoiceNumber: 'INV-2026-0001',
        amountVnd: 1500000,
        receiptId: CANONICAL_FE_RECEIPT_ID,
      }),
    );

    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /Đã ghi nhận thanh toán/);
    assert.match(html, /Thanh toán đã ghi nhận — Đang hoàn tất kích hoạt/);
    assert.match(html, /INV-2026-0001/);
    assert.match(html, /1\.500\.000 VND/);
    assert.ok(html.includes(CANONICAL_FE_RECEIPT_ID));
    assert.doesNotMatch(html, /<button/);
  });

  test('renders ACTIVATED state with optional CTA button and English formatting', () => {
    const viHtml = renderToStaticMarkup(
      createElement(LivePaymentSuccessBanner, {
        status: 'ACTIVATED',
        invoiceNumber: 'INV-2026-0001',
        amountVnd: 1500000,
        receiptId: CANONICAL_FE_RECEIPT_ID,
        onContinue: () => {},
        continueLabel: 'Vào bảng điều khiển',
      }),
    );

    assert.match(viHtml, /role="status"/);
    assert.match(viHtml, /Đã kích hoạt dịch vụ/);
    assert.match(viHtml, /Thanh toán thành công — Đã tự động kích hoạt dịch vụ/);
    assert.match(viHtml, /INV-2026-0001/);
    assert.match(viHtml, /1\.500\.000 VND/);
    assert.ok(viHtml.includes(CANONICAL_FE_RECEIPT_ID));
    assert.match(viHtml, /<button[^>]*type="button"/);
    assert.match(viHtml, /Vào bảng điều khiển/);

    const enHtml = renderToStaticMarkup(
      createElement(LivePaymentSuccessBanner, {
        status: 'ACTIVATED',
        locale: 'en',
        invoiceNumber: 'INV-2026-0001',
        amountVnd: '1500000',
        receiptId: CANONICAL_FE_RECEIPT_ID,
        onContinue: () => {},
      }),
    );
    assert.match(enHtml, /Service Activated/);
    assert.match(enHtml, /1,500,000 VND/);
    assert.match(enHtml, /Continue to workspace/);
  });
});

describe('useCommercialLiveSync SSR safety', () => {
  test('renders initial idle flags safely on the server', () => {
    const html = renderToStaticMarkup(createElement(LiveSyncSsrProbe));
    assert.equal(html, '<div>IDLE:false:false:false:false</div>');
  });
});
