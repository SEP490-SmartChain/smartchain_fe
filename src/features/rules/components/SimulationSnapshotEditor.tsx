import { useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';

import {
  allocationSnapshotSchema,
  carrierSnapshotSchema,
  type AllocationSnapshot,
  type CarrierSnapshot,
} from '../schemas/simulationProjectionSchema';

import type { RuleKind, RuleRecord } from '../types/rule.types';

function exampleAllocation(): AllocationSnapshot {
  return {
    asOf: '2026-10-26',
    destinationProvince: '01',
    destinationRegion: 'NORTH',
    items: [
      {
        productId: 'SKU-DEMO',
        qty: 10,
        unitValueVnd: '10000',
        trackExpiry: true,
        minOutboundDays: 7,
        active: true,
      },
    ],
    warehouses: [
      {
        id: 'WH-HN',
        province: '01',
        region: 'NORTH',
        eligible: true,
        estimatedFreightVnd: '25000',
      },
      {
        id: 'WH-DN',
        province: '48',
        region: 'CENTRAL',
        eligible: true,
        estimatedFreightVnd: '35000',
      },
    ],
    stock: [
      {
        id: 'STOCK-HN',
        warehouseId: 'WH-HN',
        productId: 'SKU-DEMO',
        lotId: 'LOT-HN',
        binId: 'HN-A01',
        availableQty: 6,
        expiresOn: '2026-12-01',
        receivedOn: '2026-10-01',
        lotStatus: 'SELLABLE',
        stockState: 'SELLABLE',
        activePosition: true,
        storageZone: true,
      },
      {
        id: 'STOCK-DN',
        warehouseId: 'WH-DN',
        productId: 'SKU-DEMO',
        lotId: 'LOT-DN',
        binId: 'DN-A01',
        availableQty: 4,
        expiresOn: '2027-01-01',
        receivedOn: '2026-10-02',
        lotStatus: 'SELLABLE',
        stockState: 'SELLABLE',
        activePosition: true,
        storageZone: true,
      },
    ],
    codVnd: '120000',
    buyerFreightVnd: '20000',
    splitPenaltyVnd: '0',
    expiryRiskVndPerUnitDay: '0',
  };
}
function exampleCarrier(rules: RuleRecord[]): CarrierSnapshot {
  const rule = rules.find((row) => row.kind === 'CARRIER');
  const action = rule && 'carrierServiceId' in rule.action ? rule.action : null;
  const ids = action ? [action.carrierServiceId, ...action.fallbackServiceIds] : [];
  return {
    measurements: { weightGram: 1200, lengthCm: '10', widthCm: '10', heightCm: '10' },
    direction: 'OUTBOUND',
    declaredValueVnd: '100000',
    tariffs: ids.map((serviceId) => ({
      serviceId,
      version: 'sample-v1',
      eligible: true,
      policy: {
        version: 1,
        divisor: 5000,
        roundingGram: 500,
        returnFeeVnd: '10000',
        declaredValuePpm: 0,
      },
      bands: [
        {
          minWeightG: 0,
          maxWeightG: null,
          includedWeightG: 1000,
          stepWeightG: 500,
          basePriceVnd: '20000',
          stepPriceVnd: '5000',
        },
      ],
    })),
  };
}
interface Props {
  kind: RuleKind;
  value: string;
  onChange: (value: string) => void;
  rules: RuleRecord[];
  error?: string;
}
export function SimulationSnapshotEditor({ kind, value, onChange, rules, error }: Props) {
  const t = useTranslations('RuleSimulator.scenario');
  let data: unknown;
  try {
    data = value ? JSON.parse(value) : null;
  } catch {
    data = null;
  }
  const allocation = allocationSnapshotSchema.safeParse(data);
  const carrier = carrierSnapshotSchema.safeParse(data);
  const [allocationDraft, setAllocationDraft] = useState<AllocationSnapshot>(() =>
    allocation.success ? allocation.data : exampleAllocation(),
  );
  const [carrierDraft, setCarrierDraft] = useState<CarrierSnapshot>(() =>
    carrier.success ? carrier.data : exampleCarrier(rules),
  );
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(value);
      const a = allocationSnapshotSchema.safeParse(parsed);
      const c = carrierSnapshotSchema.safeParse(parsed);
      if (a.success) setAllocationDraft(a.data);
      if (c.success) setCarrierDraft(c.data);
    } catch {
      /* An incomplete advanced edit retains the structured draft until it validates. */
    }
  }, [value]);
  const change = (next: unknown) => onChange(JSON.stringify(next));
  const checkbox = (label: string, checked: boolean, update: (value: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => update(event.target.checked)} />
      {label}
    </label>
  );
  return (
    <fieldset className="space-y-4 rounded-xl border border-[var(--sc-border-default)] p-4">
      <legend className="px-2 font-semibold">{t('title')}</legend>
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            change(kind === 'ALLOCATION' ? exampleAllocation() : exampleCarrier(rules))
          }
        >
          {value ? t('reset') : t('add')}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange('')}>
            {t('remove')}
          </Button>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {kind === 'ALLOCATION' &&
        value &&
        (() => {
          const input = allocationDraft;
          const update = (patch: Partial<AllocationSnapshot>) => {
            const next = { ...input, ...patch };
            setAllocationDraft(next);
            change(next);
          };
          return (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  type="date"
                  label={t('asOf')}
                  value={input.asOf}
                  onChange={(event) => update({ asOf: event.target.value })}
                />
                <Input
                  label={t('province')}
                  value={input.destinationProvince}
                  onChange={(event) => update({ destinationProvince: event.target.value })}
                />
                <Input
                  label={t('region')}
                  value={input.destinationRegion}
                  onChange={(event) => update({ destinationRegion: event.target.value })}
                />
                {(
                  [
                    'codVnd',
                    'buyerFreightVnd',
                    'splitPenaltyVnd',
                    'expiryRiskVndPerUnitDay',
                  ] as const
                ).map((field) => (
                  <Input
                    key={field}
                    label={t(field)}
                    inputMode="numeric"
                    value={input[field]}
                    onChange={(event) => update({ [field]: event.target.value })}
                  />
                ))}
              </div>
              <h3 className="font-medium">{t('items')}</h3>
              {input.items.map((item, index) => (
                <div
                  key={item.productId}
                  className="grid gap-3 rounded-lg bg-[var(--sc-bg-secondary)] p-3 sm:grid-cols-3"
                >
                  <Input
                    label={t('productId')}
                    value={item.productId}
                    readOnly
                    onChange={(event) =>
                      update({
                        items: input.items.map((row, i) =>
                          i === index ? { ...row, productId: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    label={t('quantity')}
                    value={item.qty}
                    onChange={(event) =>
                      update({
                        items: input.items.map((row, i) =>
                          i === index ? { ...row, qty: Number(event.target.value) } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    label={t('unitValue')}
                    inputMode="numeric"
                    value={item.unitValueVnd}
                    onChange={(event) =>
                      update({
                        items: input.items.map((row, i) =>
                          i === index ? { ...row, unitValueVnd: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    label={t('minOutboundDays')}
                    value={item.minOutboundDays}
                    onChange={(event) =>
                      update({
                        items: input.items.map((row, i) =>
                          i === index
                            ? { ...row, minOutboundDays: Number(event.target.value) }
                            : row,
                        ),
                      })
                    }
                  />
                  {checkbox(t('trackExpiry'), item.trackExpiry, (trackExpiry) =>
                    update({
                      items: input.items.map((row, i) =>
                        i === index ? { ...row, trackExpiry } : row,
                      ),
                    }),
                  )}
                  {checkbox(t('active'), item.active, (active) =>
                    update({
                      items: input.items.map((row, i) => (i === index ? { ...row, active } : row)),
                    }),
                  )}
                </div>
              ))}
              <h3 className="font-medium">{t('warehouses')}</h3>
              {input.warehouses.map((warehouse, index) => (
                <div
                  key={warehouse.id}
                  className="grid gap-3 rounded-lg border border-[var(--sc-border-default)] p-3 sm:grid-cols-3"
                >
                  {(['id', 'province', 'region', 'estimatedFreightVnd'] as const).map((field) => (
                    <Input
                      key={field}
                      label={t(field)}
                      value={warehouse[field] ?? ''}
                      readOnly={field === 'id'}
                      onChange={(event) =>
                        update({
                          warehouses: input.warehouses.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  [field]:
                                    field === 'estimatedFreightVnd' && !event.target.value
                                      ? null
                                      : event.target.value,
                                }
                              : row,
                          ),
                        })
                      }
                    />
                  ))}
                  {checkbox(t('eligible'), warehouse.eligible, (eligible) =>
                    update({
                      warehouses: input.warehouses.map((row, i) =>
                        i === index ? { ...row, eligible } : row,
                      ),
                    }),
                  )}
                </div>
              ))}
              <h3 className="font-medium">{t('stock')}</h3>
              {input.stock.map((stock, index) => (
                <div
                  key={stock.id}
                  className="grid gap-3 rounded-lg border border-[var(--sc-border-default)] p-3 sm:grid-cols-3"
                >
                  {(['warehouseId', 'productId', 'lotId', 'binId'] as const).map((field) => (
                    <Input
                      key={field}
                      label={t(field)}
                      value={stock[field]}
                      onChange={(event) =>
                        update({
                          stock: input.stock.map((row, i) =>
                            i === index ? { ...row, [field]: event.target.value } : row,
                          ),
                        })
                      }
                    />
                  ))}
                  <Input
                    type="number"
                    min={0}
                    label={t('availableQty')}
                    value={stock.availableQty}
                    onChange={(event) =>
                      update({
                        stock: input.stock.map((row, i) =>
                          i === index ? { ...row, availableQty: Number(event.target.value) } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    type="date"
                    label={t('expiresOn')}
                    value={stock.expiresOn ?? ''}
                    onChange={(event) =>
                      update({
                        stock: input.stock.map((row, i) =>
                          i === index ? { ...row, expiresOn: event.target.value || null } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    type="date"
                    label={t('receivedOn')}
                    value={stock.receivedOn}
                    onChange={(event) =>
                      update({
                        stock: input.stock.map((row, i) =>
                          i === index ? { ...row, receivedOn: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  <Select
                    label={t('stockState')}
                    value={stock.stockState}
                    options={(['SELLABLE', 'QUARANTINE', 'RECEIVING'] as const).map((state) => ({
                      value: state,
                      label: t(`states.${state}`),
                    }))}
                    onChange={(event) => {
                      const parsed =
                        allocationSnapshotSchema.shape.stock.element.shape.stockState.safeParse(
                          event.target.value,
                        );
                      if (parsed.success) {
                        update({
                          stock: input.stock.map((row, i) =>
                            i === index ? { ...row, stockState: parsed.data } : row,
                          ),
                        });
                      }
                    }}
                  />
                  {checkbox(
                    t('locationActive'),
                    stock.activePosition && stock.storageZone,
                    (activePosition) =>
                      update({
                        stock: input.stock.map((row, i) =>
                          i === index
                            ? { ...row, activePosition, storageZone: activePosition }
                            : row,
                        ),
                      }),
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      {kind === 'CARRIER' &&
        value &&
        (() => {
          const input = carrierDraft;
          const update = (patch: Partial<CarrierSnapshot>) => {
            const next = { ...input, ...patch };
            setCarrierDraft(next);
            change(next);
          };
          return (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  type="number"
                  min={1}
                  label={t('weightGram')}
                  value={input.measurements.weightGram}
                  onChange={(event) =>
                    update({
                      measurements: {
                        ...input.measurements,
                        weightGram: Number(event.target.value),
                      },
                    })
                  }
                />
                {(['lengthCm', 'widthCm', 'heightCm'] as const).map((field) => (
                  <Input
                    key={field}
                    label={t(field)}
                    value={input.measurements[field]}
                    onChange={(event) =>
                      update({
                        measurements: { ...input.measurements, [field]: event.target.value },
                      })
                    }
                  />
                ))}
                <Input
                  label={t('declaredValueVnd')}
                  value={input.declaredValueVnd}
                  onChange={(event) => update({ declaredValueVnd: event.target.value })}
                />
              </div>
              {input.tariffs.length === 0 && <Alert>{t('noTariffs')}</Alert>}
              {input.tariffs.map((tariff, index) => (
                <div
                  key={tariff.serviceId}
                  className="space-y-3 rounded-lg border border-[var(--sc-border-default)] p-3"
                >
                  <p className="break-all text-sm">
                    {t('serviceId')}: {tariff.serviceId}
                  </p>
                  {checkbox(t('serviceAvailable'), tariff.eligible, (eligible) =>
                    update({
                      tariffs: input.tariffs.map((row, i) =>
                        i === index ? { ...row, eligible } : row,
                      ),
                    }),
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label={t('tariffVersion')}
                      value={tariff.version}
                      onChange={(event) =>
                        update({
                          tariffs: input.tariffs.map((row, i) =>
                            i === index ? { ...row, version: event.target.value } : row,
                          ),
                        })
                      }
                    />
                    {tariff.bands.map((band, bandIndex) => (
                      <div key={String(band.minWeightG)} className="contents">
                        {(['basePriceVnd', 'stepPriceVnd'] as const).map((field) => (
                          <Input
                            key={field}
                            label={t(field)}
                            value={band[field]}
                            onChange={(event) =>
                              update({
                                tariffs: input.tariffs.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        bands: row.bands.map((current, j) =>
                                          j === bandIndex
                                            ? { ...current, [field]: event.target.value }
                                            : current,
                                        ),
                                      }
                                    : row,
                                ),
                              })
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      <details className="text-sm">
        <summary className="cursor-pointer">{t('advanced')}</summary>
        <label className="mt-3 block space-y-2">
          <span>{t('snapshot')}</span>
          <textarea
            className="min-h-44 w-full rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 font-mono text-xs"
            value={
              value
                ? (() => {
                    try {
                      return JSON.stringify(JSON.parse(value), null, 2);
                    } catch {
                      return value;
                    }
                  })()
                : ''
            }
            onChange={(event) => onChange(event.target.value)}
            maxLength={100000}
          />
        </label>
      </details>
    </fieldset>
  );
}
