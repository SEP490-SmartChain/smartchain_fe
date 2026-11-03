import { useId } from 'react';

import { useTranslations } from 'next-intl';

import { Button, Card, CardContent } from '@/components/Common';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import type { PutawayTask, PutawayWaitingItem } from '../api/putawayApi';

export function PutawayWaitingActions({
  reason,
  disabled,
  onPrepare,
}: {
  reason: PutawayWaitingItem['reason'];
  disabled: boolean;
  onPrepare: () => void;
}) {
  const t = useTranslations('Putaway'),
    { can } = useAccess(),
    hintId = useId();
  const manager = can('warehouse.asn.review');
  if (!can('warehouse.putaway.assign')) return null;
  if (reason === 'CAPACITY_REQUIRED' && can('warehouses.layout.manage')) {
    return (
      <div className="space-y-2">
        <Button size="sm" disabled={disabled} onClick={onPrepare} aria-describedby={hintId}>
          {t('prepare')}
        </Button>
        <p id={hintId} className="max-w-48 text-xs text-[var(--sc-text-secondary)]">
          {t('capacityManagerAction')}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled aria-describedby={hintId}>
        {t(manager ? 'assign' : 'claim')}
      </Button>
      <p id={hintId} className="max-w-48 text-xs text-[var(--sc-text-secondary)]">
        {reason === 'CAPACITY_REQUIRED'
          ? t(manager ? 'capacityManagerAction' : 'capacityStaffAction')
          : t('waitingTaskRequired')}
      </p>
    </div>
  );
}

export function PutawayTaskCard({
  task,
  staff,
  selected,
  disabled,
  onOpen,
}: {
  task: PutawayTask;
  staff: { id: string; fullName: string }[];
  selected: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('Putaway'),
    { can } = useAccess(),
    userId = useAuthStore((state) => state.user?.userId);
  const manager = can('warehouse.asn.review'),
    canAssign =
      can('warehouse.putaway.assign') &&
      (task.status === 'OPEN' || (manager && task.status === 'ASSIGNED')),
    canConfirm =
      can('warehouse.putaway.confirm') && task.status === 'ASSIGNED' && task.assigneeId === userId;
  const action = canAssign
    ? manager
      ? task.status === 'ASSIGNED'
        ? 'reassign'
        : 'assign'
      : 'claim'
    : canConfirm
      ? 'startPutaway'
      : 'openTask';
  const assigneeName =
    task.assigneeId === userId
      ? t('you')
      : staff.find((person) => person.id === task.assigneeId)?.fullName;
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3">
        <p className="break-words font-semibold">{task.productName}</p>
        <p className="break-words text-sm text-[var(--sc-text-secondary)]">
          {task.sku} · {task.lotCode}
        </p>
        <p className="break-words text-sm">
          {task.fromBinCode} → {task.toBinCode}
        </p>
        <p className="text-sm">
          {t('taskSummary', {
            quantity: task.qty,
            confirmed: task.confirmedQty,
            status: t(`status.${task.status}`),
          })}
        </p>
        {task.status === 'ASSIGNED' && (
          <p className="text-sm text-[var(--sc-text-secondary)]">
            {assigneeName ? t('assignedTo', { name: assigneeName }) : t('assignedToOther')}
          </p>
        )}
        {(canAssign || canConfirm || can('warehouse.putaway.overrideBin')) && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={onOpen}
            aria-expanded={selected}
            aria-controls={selected ? `putaway-task-${task.id}` : undefined}
          >
            {t(action)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
