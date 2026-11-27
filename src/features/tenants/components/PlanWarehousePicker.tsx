import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Checkbox } from '@/components/Common/Checkbox/Checkbox';
import { Radio } from '@/components/Common/Radio/Radio';
import type { Warehouse } from '@/features/catalog';

import {
  isBasicWarehousePlan,
  normalizeWarehouseIds,
  validatePlanWarehouseSelection,
  type PlanWarehouseRuleSubject,
} from '../lib/warehouseSelection';

interface PlanWarehousePickerProps {
  plan: PlanWarehouseRuleSubject;
  warehouses: readonly Warehouse[];
  loading: boolean;
  errorMessage: string | null;
  selectedIds: readonly string[];
  confirmed: boolean;
  disabled?: boolean;
  currentSelectedIds?: readonly string[];
  onChangeIds: (ids: string[]) => void;
  onChangeConfirmed: (confirmed: boolean) => void;
  onRetry: () => void;
}

export function PlanWarehousePicker({
  plan,
  warehouses,
  loading,
  errorMessage,
  selectedIds,
  confirmed,
  disabled = false,
  currentSelectedIds,
  onChangeIds,
  onChangeConfirmed,
  onRetry,
}: PlanWarehousePickerProps) {
  const t = useTranslations('Commercial');
  const exactOne = isBasicWarehousePlan(plan);
  const validation = validatePlanWarehouseSelection(plan, selectedIds);
  const selectedSet = new Set(validation.normalizedIds);
  const currentSet = new Set(currentSelectedIds ?? []);

  function selectSingle(warehouseId: string) {
    onChangeIds([warehouseId]);
    onChangeConfirmed(false);
  }

  function toggleMulti(warehouseId: string) {
    const next = selectedSet.has(warehouseId)
      ? validation.normalizedIds.filter((id) => id !== warehouseId)
      : [...validation.normalizedIds, warehouseId];
    onChangeIds(normalizeWarehouseIds(next));
    onChangeConfirmed(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--sc-text-primary)]">
            {t('warehouseSelectionTitle')}
          </p>
          <p className="text-xs text-[var(--sc-text-secondary)]">
            {exactOne
              ? t('warehouseSelectionBasicRule')
              : t('warehouseSelectionStandardRule', { max: validation.max })}
          </p>
        </div>
        <span className="text-xs font-medium text-[var(--sc-text-secondary)] tabular-nums">
          {t('warehouseSelectionCount', {
            selected: validation.normalizedIds.length,
            max: validation.max,
          })}
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--sc-text-secondary)]">{t('warehouseLoading')}</p>
      ) : null}

      {!loading && errorMessage ? (
        <Alert variant="error" compact notify={false}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{errorMessage}</span>
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              {t('retryWarehouses')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!loading && !errorMessage && warehouses.length === 0 ? (
        <Alert variant="warning" compact notify={false}>
          {t('noActiveWarehouses')}
        </Alert>
      ) : null}

      {!loading && !errorMessage && warehouses.length > 0 ? (
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {warehouses.map((warehouse) => {
            const isSelected = selectedSet.has(warehouse.id);
            const isCurrent = currentSet.has(warehouse.id);
            const reachedMax =
              !exactOne && !isSelected && validation.normalizedIds.length >= validation.max;
            const itemDisabled = disabled || reachedMax;

            return (
              <div
                key={warehouse.id}
                className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {exactOne ? (
                    <Radio
                      name="plan-warehouse-selection"
                      value={warehouse.id}
                      checked={isSelected}
                      disabled={disabled}
                      label={`${warehouse.code} — ${warehouse.name}`}
                      onChange={() => selectSingle(warehouse.id)}
                    />
                  ) : (
                    <Checkbox
                      checked={isSelected}
                      disabled={itemDisabled}
                      label={`${warehouse.code} — ${warehouse.name}`}
                      onChange={() => toggleMulti(warehouse.id)}
                    />
                  )}
                  {isCurrent ? (
                    <Badge
                      status="info"
                      variant="solid"
                      size="sm"
                      label={t('currentWarehouseBadge')}
                    />
                  ) : null}
                </div>
                <p className="mt-1 pl-6 text-xs text-[var(--sc-text-secondary)]">
                  {warehouse.region} · {warehouse.address}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && !errorMessage && warehouses.length > 0 && !validation.valid ? (
        <p className="text-xs text-[var(--sc-error-dark)]">
          {validation.reason === 'exactOne'
            ? t('warehouseSelectionExactOneError')
            : validation.reason === 'maxLimit'
              ? t('warehouseSelectionMaxLimitError', { max: validation.max })
              : t('warehouseSelectionRequiredError')}
        </p>
      ) : null}

      {!loading && !errorMessage && warehouses.length > 0 ? (
        <Checkbox
          checked={confirmed}
          disabled={disabled || !validation.valid}
          label={t('warehouseSelectionConfirmLabel')}
          onChange={(event) => onChangeConfirmed(event.target.checked)}
        />
      ) : null}
    </div>
  );
}
