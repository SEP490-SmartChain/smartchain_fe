import { useId } from 'react';

import { useTranslations } from 'next-intl';

import { Alert, Badge, Button, Card, CardHeader, PageHeader, Select } from '@/components/Common';
import { useWarehouseEvidenceTasks } from '@/features/claims/hooks/useWarehouseEvidenceTasks';
import { getAuthScopeKey } from '@/lib/authScope';
import { useAuthStore } from '@/stores/authStore';

export default function WarehouseEvidenceTasksPage() {
  const scopeKey = useAuthStore((state) => getAuthScopeKey(state.user));
  return <WarehouseEvidenceTasksWorkspace key={scopeKey} />;
}

function WarehouseEvidenceTasksWorkspace() {
  const t = useTranslations('WarehouseEvidenceTasks');
  const fileInputId = useId();
  const fileHelpId = useId();
  const {
    assignedWarehouseIds,
    canSubmit,
    fileInvalid,
    loadMore,
    retryList,
    selectFile,
    selectTask,
    selectWarehouse,
    selectedTask,
    state,
    submitEvidence,
  } = useWarehouseEvidenceTasks();

  const warehouseOptions = assignedWarehouseIds.map((warehouseId, index) => ({
    value: warehouseId,
    label: t('warehouseOption', { number: index + 1, code: warehouseId.slice(0, 8) }),
  }));
  const uploadErrorKey = state.uploadError ? `uploadErrors.${state.uploadError}` : null;
  const loadErrorMessage = state.loadError === 'denied' ? t('scopeDenied') : t('loadError');
  const submitLabel =
    state.uploadState === 'retry'
      ? t('retrySame')
      : state.uploadError === 'expired' || state.uploadError === 'restart'
        ? t('startNewUpload')
        : t('submit');

  return (
    <div className="sc-page space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {assignedWarehouseIds.length === 0 ? (
        <Alert variant="info">{t('noAssignment')}</Alert>
      ) : (
        <>
          {assignedWarehouseIds.length > 1 ? (
            <div className="max-w-xl">
              <Select
                label={t('warehouse')}
                value={state.warehouseId}
                onChange={(event) => selectWarehouse(event.target.value)}
                options={warehouseOptions}
              />
            </div>
          ) : (
            <Card padding="sm" className="max-w-xl">
              <p className="mb-1 text-sm font-medium text-[var(--sc-text-primary)]">
                {t('warehouse')}
              </p>
              <p className="m-0 text-sm text-[var(--sc-text-secondary)]">
                {warehouseOptions[0]?.label}
              </p>
            </Card>
          )}

          <Alert variant="info">{t('scopeNotice')}</Alert>

          {state.uploadSucceeded && <Alert variant="success">{t('uploadSucceeded')}</Alert>}
          {uploadErrorKey && <Alert variant="error">{t(uploadErrorKey)}</Alert>}

          <Card>
            <CardHeader
              title={t('queueTitle')}
              description={t('queueDescription')}
              action={
                <Button
                  variant="secondary"
                  isLoading={state.loading === 'initial'}
                  disabled={
                    Boolean(state.pending) ||
                    state.uploadState === 'uploading' ||
                    Boolean(state.selectedClaimId)
                  }
                  onClick={retryList}
                >
                  {t('refresh')}
                </Button>
              }
            />

            {state.loading === 'initial' && state.tasks.length === 0 ? (
              <p className="m-0 text-sm text-[var(--sc-text-secondary)]" role="status">
                {t('loading')}
              </p>
            ) : state.loadError && state.tasks.length === 0 ? (
              <div className="space-y-3">
                <Alert variant="error">{loadErrorMessage}</Alert>
                <Button variant="secondary" onClick={retryList}>
                  {t('retry')}
                </Button>
              </div>
            ) : state.tasks.length === 0 ? (
              <p className="m-0 text-sm text-[var(--sc-text-secondary)]">{t('empty')}</p>
            ) : (
              <>
                <ul
                  className="divide-y divide-[var(--sc-border-default)]"
                  aria-label={t('queueTitle')}
                >
                  {state.tasks.map((task) => {
                    const selected = task.claimId === state.selectedClaimId;
                    const canChoose = canSubmit && task.canSubmitEvidence && !state.pending;
                    return (
                      <li key={task.claimId}>
                        <button
                          type="button"
                          className={`w-full space-y-3 rounded-lg p-4 text-left transition-colors hover:bg-[var(--sc-primary-alpha-08)] disabled:cursor-not-allowed disabled:opacity-70 ${selected ? 'bg-[var(--sc-primary-alpha-08)]' : ''}`}
                          aria-label={t('selectTaskAccessible', { claimId: task.claimId })}
                          aria-pressed={selected}
                          disabled={!canChoose}
                          onClick={() => selectTask(task.claimId)}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="break-all font-medium text-[var(--sc-text-primary)]">
                              {t('claimReference', { claimId: task.claimId })}
                            </span>
                            <div className="flex items-center gap-2">
                              {task.version > 1 && (
                                <Badge status="success" label={t('evidenceSubmitted')} />
                              )}
                              <Badge
                                status={task.status === 'OPEN' ? 'info' : 'warning'}
                                label={t(`statuses.${task.status}`)}
                              />
                            </div>
                          </div>
                          <dl className="grid gap-2 text-sm sm:grid-cols-3">
                            <div>
                              <dt className="text-[var(--sc-text-tertiary)]">
                                {t('fulfillmentOrder')}
                              </dt>
                              <dd className="m-0 break-all text-[var(--sc-text-secondary)]">
                                {task.fulfillmentOrderId}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[var(--sc-text-tertiary)]">{t('incident')}</dt>
                              <dd className="m-0 text-[var(--sc-text-secondary)]">
                                {t(`incidents.${task.incidentType}`)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[var(--sc-text-tertiary)]">{t('sequence')}</dt>
                              <dd className="m-0 text-[var(--sc-text-secondary)]">
                                #{task.sequenceNo}
                              </dd>
                            </div>
                          </dl>
                          {!task.canSubmitEvidence && (
                            <p className="m-0 text-sm text-[var(--sc-text-tertiary)]">
                              {t('submissionUnavailable')}
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {state.loadError && <Alert variant="error">{loadErrorMessage}</Alert>}
                {state.nextAfter && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      isLoading={state.loading === 'more'}
                      disabled={state.loading !== 'idle'}
                      onClick={loadMore}
                    >
                      {t('loadMore')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          {selectedTask && canSubmit && (
            <Card>
              <CardHeader
                title={selectedTask.version > 1 ? t('uploadAdditionalTitle') : t('uploadTitle')}
                description={t('uploadDescription')}
              />
              <div className="space-y-4">
                {selectedTask.version > 1 && (
                  <Alert variant="info">{t('evidenceAlreadySubmittedNotice')}</Alert>
                )}
                <p className="m-0 break-all text-sm text-[var(--sc-text-secondary)]">
                  {t('selectedClaim', { claimId: selectedTask.claimId })}
                </p>
                <div>
                  <label
                    htmlFor={fileInputId}
                    className="mb-2 block text-sm font-medium text-[var(--sc-text-primary)]"
                  >
                    {t('chooseImage')}
                  </label>
                  <input
                    id={fileInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-describedby={fileHelpId}
                    disabled={Boolean(state.pending) || state.uploadState === 'uploading'}
                    className="block w-full max-w-xl rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-2 text-sm text-[var(--sc-text-primary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--sc-bg-secondary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--sc-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    onChange={(event) => {
                      selectFile(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                  <p id={fileHelpId} className="mb-0 mt-2 text-sm text-[var(--sc-text-secondary)]">
                    {t('imageRequirements')}
                  </p>
                  {state.selectedFile && (
                    <p className="mb-0 mt-2 text-sm text-[var(--sc-text-secondary)]" role="status">
                      {t('imageSelected')}
                    </p>
                  )}
                  {fileInvalid && (
                    <p className="mb-0 mt-2 text-sm text-[var(--sc-error-dark)]" role="alert">
                      {t('invalidImage')}
                    </p>
                  )}
                  {state.pending && state.uploadState === 'retry' && (
                    <p className="mb-0 mt-2 text-sm text-[var(--sc-warning-dark)]" role="status">
                      {t('retrySameHint')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    isLoading={state.uploadState === 'uploading'}
                    disabled={
                      !state.selectedFile ||
                      fileInvalid ||
                      !selectedTask.canSubmitEvidence ||
                      state.uploadState === 'uploading'
                    }
                    onClick={() => void submitEvidence()}
                  >
                    {submitLabel}
                  </Button>
                  {!state.pending && state.selectedFile && (
                    <Button variant="secondary" onClick={() => selectFile(null)}>
                      {t('clearImage')}
                    </Button>
                  )}
                  {!state.pending && (
                    <Button variant="secondary" onClick={() => selectTask(selectedTask.claimId)}>
                      {t('closeTaskForm')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
