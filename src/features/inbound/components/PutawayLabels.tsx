import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';

import { Alert, Button, Checkbox, Input } from '@/components/Common';

import { putawayApi, type PutawayTask } from '../api/putawayApi';
import { InboundScanButton } from './InboundScanButton';

type Label = { title: string; src: string; productName?: string };

export function PutawayLabels({
  warehouse,
  task,
  disabled,
}: {
  warehouse: string;
  task: PutawayTask;
  disabled: boolean;
}) {
  const t = useTranslations('Putaway');
  const [details, setDetails] = useState<Awaited<ReturnType<typeof putawayApi.labels>>>();
  const [labels, setLabels] = useState<Label[]>([]);
  const [binScan, setBinScan] = useState('');
  const [attested, setAttested] = useState(false);
  const [verifiedBin, setVerifiedBin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = task.status === 'OPEN' || task.status === 'ASSIGNED';

  useEffect(() => {
    const controller = new AbortController();
    void putawayApi.labels(warehouse, task, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setDetails(value);
      },
      () => {
        if (!controller.signal.aborted) setError(true);
      },
    );
    return () => controller.abort();
  }, [warehouse, task]);

  async function preview(items: { title: string; value: string; productName?: string }[]) {
    try {
      setLabels(
        await Promise.all(
          items.map(async ({ title, value, productName }) => ({
            title,
            productName,
            src: await QRCode.toDataURL(value, { width: 192, margin: 4 }),
          })),
        ),
      );
      setError(false);
    } catch {
      setError(true);
    }
  }

  async function verify() {
    if (!attested || !binScan.trim() || busy || disabled) return;
    setBusy(true);
    setError(false);
    try {
      const result = await putawayApi.verifyLabels(warehouse, task, binScan);
      setVerifiedBin(result.binCode);
      setAttested(false);
      setBinScan('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{t('labelHeading')}</h3>
      <p className="text-sm">{t('labelHelp')}</p>
      {error && <Alert variant="error">{t('labelsError')}</Alert>}
      {details && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void preview([
                  {
                    title: t('labelSku', { value: task.sku }),
                    value: details.skuQr,
                    productName: task.productName,
                  },
                  {
                    title: t('labelLot', { value: task.lotCode }),
                    value: details.lotQr,
                    productName: task.productName,
                  },
                ])
              }
            >
              {t('printStockLabels')}
            </Button>
            {details.binBarcode && (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  void preview([
                    {
                      title: t('labelBin', { value: task.toBinCode }),
                      value: details.binBarcode ?? '',
                    },
                  ])
                }
              >
                {t('printBinLabel')}
              </Button>
            )}
          </div>
          {labels.length > 0 && (
            <>
              <div className="flex flex-wrap gap-4">
                {labels.map((label) => (
                  <figure key={label.title}>
                    <img src={label.src} alt={label.title} width={132} height={132} />
                    <figcaption>
                      {label.title}
                      {label.productName && <div>{label.productName}</div>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={() => window.print()}>
                {t('printLabelPreview')}
              </Button>
              {createPortal(
                <div id="orca-putaway-print">
                  {labels.map((label) => (
                    <figure
                      key={label.title}
                      style={{ breakInside: 'avoid', display: 'inline-block', textAlign: 'center' }}
                    >
                      <img src={label.src} alt={label.title} width={168} height={168} />
                      <figcaption>
                        {label.title}
                        {label.productName && <div>{label.productName}</div>}
                      </figcaption>
                    </figure>
                  ))}
                  <style>
                    {
                      '#orca-putaway-print{display:none}@media print{body > :not(#orca-putaway-print){display:none!important}#orca-putaway-print{display:block;color:#000;background:#fff}}'
                    }
                  </style>
                </div>,
                document.body,
              )}
            </>
          )}
          {(verifiedBin || details.verified) && (
            <p role="status">{t('labelsVerified', { bin: verifiedBin || task.toBinCode })}</p>
          )}
          {active && (
            <div className="space-y-2">
              <Input
                label={t('scanVerifiedBin')}
                value={binScan}
                disabled={busy || disabled}
                onChange={(event) => setBinScan(event.target.value)}
              />
              <InboundScanButton
                label={t('scanVerifiedBin')}
                onScan={setBinScan}
                disabled={busy || disabled}
              />
              <Checkbox
                checked={attested}
                disabled={busy || disabled}
                label={t('labelsAttest')}
                onChange={(event) => setAttested(event.target.checked)}
              />
              <Button
                type="button"
                disabled={busy || disabled || !attested || !binScan.trim()}
                onClick={() => void verify()}
              >
                {t('verifyLabels')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
