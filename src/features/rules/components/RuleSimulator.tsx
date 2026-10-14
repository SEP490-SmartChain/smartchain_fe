import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Alert } from '@/components/Common/Alert/Alert';
import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { ApiError } from '@/services/apiClient';

import { ruleSimulationApi } from '../api/ruleSimulationApi';
import {
  simulationFormSchema,
  toSimulationRequest,
  type SimulationForm,
  type SimulationResult,
} from '../schemas/ruleSimulationSchema';

import type { RuleKind, RuleRecord } from '../types/rule.types';

const empty: SimulationForm = {
  sellerId: '',
  provinceCode: '',
  wardCode: '',
  warehouseId: '',
  weightG: '',
  itemCount: '',
  codAmountVnd: '',
  isCod: '',
  ruleId: '',
  ruleVersion: '',
};
export function RuleSimulator({ kind, rules }: { kind: RuleKind; rules: RuleRecord[] }) {
  const t = useTranslations('RuleSimulator');
  const ruleT = useTranslations('Rules');
  const { can } = useAccess();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SimulationForm>({
    resolver: zodResolver(simulationFormSchema(t('invalid'))),
    defaultValues: empty,
  });
  const values = watch();
  const fingerprint = JSON.stringify({
    kind,
    values,
    revisions: rules.map((rule) => [rule.id, rule.version, rule.publishedVersion]),
  });
  const [savedResult, setResult] = useState<{ fingerprint: string; data: SimulationResult } | null>(
    null,
  );
  const result = savedResult?.fingerprint === fingerprint ? savedResult.data : null;
  const [error, setError] = useState<string | null>(null);
  const requests = useRef<{ generation: number; controller: AbortController | null }>({
    generation: 0,
    controller: null,
  });
  useEffect(() => {
    const state = requests.current;
    state.generation++;
    state.controller?.abort();
    setResult(null);
    setError(null);
    return () => {
      state.generation++;
      state.controller?.abort();
    };
  }, [fingerprint]);
  const allowed = can(
    kind === 'ALLOCATION' ? 'rules.simulate.allocation' : 'rules.simulate.carrier',
  );
  const submit = handleSubmit(async (value) => {
    if (!allowed) return;
    const state = requests.current;
    const attempt = ++state.generation;
    state.controller?.abort();
    state.controller = new AbortController();
    setResult(null);
    setError(null);
    try {
      const response = await ruleSimulationApi.simulate(
        toSimulationRequest(kind, value),
        state.controller.signal,
      );
      if (attempt === state.generation) setResult({ fingerprint, data: response });
    } catch (failure) {
      if (attempt === state.generation) {
        setError(failure instanceof ApiError ? failure.message : t('failed'));
      }
    }
  });
  if (!allowed) return null;
  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-5"
      aria-label={t('title')}
    >
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-[var(--sc-text-secondary)]">{t('description')}</p>
      </div>
      <Alert>{t('readOnly')}</Alert>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label={t('sellerId')}
            required
            {...register('sellerId')}
            error={errors.sellerId?.message}
          />
          <Input
            label={t('provinceCode')}
            {...register('provinceCode')}
            error={errors.provinceCode?.message}
          />
          <Input label={t('wardCode')} {...register('wardCode')} error={errors.wardCode?.message} />
          <Input
            label={t('warehouseId')}
            {...register('warehouseId')}
            error={errors.warehouseId?.message}
            helperText={t('warehouseHint')}
          />
          <Input
            label={t('weightG')}
            inputMode="numeric"
            {...register('weightG')}
            error={errors.weightG?.message}
          />
          <Input
            label={t('itemCount')}
            inputMode="numeric"
            {...register('itemCount')}
            error={errors.itemCount?.message}
          />
          <Input
            label={t('codAmountVnd')}
            inputMode="numeric"
            {...register('codAmountVnd')}
            error={errors.codAmountVnd?.message}
          />
          <Select
            label={t('isCod')}
            value={values.isCod}
            placeholder={t('notSupplied')}
            isPlaceholderDisabled={false}
            options={[
              { value: 'true', label: t('yes') },
              { value: 'false', label: t('no') },
            ]}
            onChange={(event) =>
              setValue(
                'isCod',
                event.target.value === 'true'
                  ? 'true'
                  : event.target.value === 'false'
                    ? 'false'
                    : '',
              )
            }
          />
          <Select
            label={t('ruleVersion')}
            value={values.ruleId}
            placeholder={t('published')}
            isPlaceholderDisabled={false}
            options={rules.map((rule) => ({
              value: rule.id,
              label: `${rule.name} · v${rule.version}`,
            }))}
            onChange={(event) => {
              setValue('ruleId', event.target.value);
              setValue(
                'ruleVersion',
                String(rules.find((rule) => rule.id === event.target.value)?.version ?? ''),
              );
            }}
          />
          {values.ruleId && (
            <Input
              label={t('savedVersion')}
              inputMode="numeric"
              {...register('ruleVersion')}
              error={errors.ruleVersion?.message}
              helperText={t('versionHint')}
            />
          )}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('running') : t('run')}
        </Button>
      </form>
      {error && (
        <Alert variant="error">
          {error}
          <p className="mt-1">{t('retryHint')}</p>
        </Alert>
      )}
      {result && (
        <div className="space-y-4" aria-live="polite">
          <Alert variant={result.match ? 'success' : 'info'}>
            {result.match
              ? t('matched', { name: result.match.name, version: result.match.ruleVersion })
              : t('noMatch')}
          </Alert>
          {result.mode === 'SAVED_VERSION' && <p className="text-sm">{t('savedPreview')}</p>}
          {result.match && 'strategy' in result.match.action && (
            <p className="font-medium">
              {t('strategy')}: {ruleT(`strategies.${result.match.action.strategy}`)}
            </p>
          )}
          {result.carrierServices.length > 0 && (
            <ol className="list-inside list-decimal space-y-1 text-sm">
              {result.carrierServices.map((service) => (
                <li key={service.id}>
                  {t(`serviceRoles.${service.role}`)}: {service.name}
                </li>
              ))}
            </ol>
          )}
          {result.pending.map((pending) => (
            <Alert key={pending} variant="warning">
              {t(`pending.${pending}`)}
            </Alert>
          ))}
          {result.trace.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label={t('trace')}>
                <thead>
                  <tr>
                    {['policy', 'version', 'priority', 'outcome'].map((label) => (
                      <th key={label} className="p-2">
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trace.map((row) => (
                    <tr key={row.ruleId} className="border-t border-[var(--sc-border-default)]">
                      <td className="p-2">
                        {row.name}
                        <p className="text-xs text-[var(--sc-text-secondary)]">
                          {t(`scopes.${row.scope}`)}
                        </p>
                      </td>
                      <td className="p-2">{row.ruleVersion}</td>
                      <td className="p-2">{row.priority}</td>
                      <td className="p-2">
                        {t(`outcomes.${row.outcome}`)}
                        {row.missingFields.length > 0 && (
                          <p className="text-xs">
                            {t('missing', {
                              fields: row.missingFields
                                .map((field) => t(`fields.${field}`))
                                .join(', '),
                            })}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
