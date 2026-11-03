import { useEffect, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FlaskConical,
  GripVertical,
  History,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import { PageHeader } from '@/components/Common/PageHeader/PageHeader';
import { Tabs } from '@/components/Common/Tabs/Tabs';
import { useAccess } from '@/hooks/useAccess';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

import { CarrierPlan } from './CarrierPlan';
import { RuleCommand, type Command } from './RuleCommand';
import { RuleEditor } from './RuleEditor';
import { RuleHistory } from './RuleHistory';
import { RuleSentence } from './RuleSentence';
import { RuleSimulator } from './RuleSimulator';
import { ruleApi } from '../api/ruleApi';
import { useRuleList } from '../hooks/useRuleList';
import { moveRule } from '../lib/rulePriority';
import { findDefaultCarrierRule } from '../lib/ruleSummary';

import type { RuleKind, RuleRecord } from '../types/rule.types';

function ScopedRules() {
  const t = useTranslations('Rules');
  const { can } = useAccess();
  const canOperate = can('routing.rule.set');
  const [kind, setKind] = useState<RuleKind>('ALLOCATION');
  const { items, isLoading, error, reload } = useRuleList(kind, t('loadError'));
  const [order, setOrder] = useState<RuleRecord[]>([]);
  const [editor, setEditor] = useState<{ rule: RuleRecord | null } | null>(null);
  const [history, setHistory] = useState<RuleRecord | null>(null);
  const [command, setCommand] = useState<Command | null>(null);
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [areServicesReady, setAreServicesReady] = useState(false);
  useEffect(() => {
    setOrder(items);
  }, [items]);
  useEffect(() => {
    if (kind !== 'CARRIER') return;
    const controller = new AbortController();
    setAreServicesReady(false);
    void ruleApi
      .targets('CARRIER_SERVICE', undefined, controller.signal)
      .then((page) => {
        setServiceNames(Object.fromEntries(page.items.map((target) => [target.id, target.name])));
        setAreServicesReady(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [kind]);
  const dirty = order.some((r, i) => r.id !== items[i]?.id);
  const defaultRule = kind === 'CARRIER' ? findDefaultCarrierRule(items) : null;
  const hasPendingDraft = items.some((r) => r.version > (r.publishedVersion ?? 0));
  const modalOpen = !!editor || !!history || !!command;
  const changeKind = (value: string) => {
    if (value !== 'ALLOCATION' && value !== 'CARRIER') return;
    setEditor(null);
    setHistory(null);
    setCommand(null);
    setOrder([]);
    setKind(value);
  };
  const moved = (from: string, to: string) => {
    if (canOperate && !modalOpen && !isLoading) setOrder((prev) => moveRule(prev, from, to));
  };
  const saved = () => {
    setEditor(null);
    setCommand(null);
    setHistory(null);
    toast.success(t('saved'));
    reload();
  };
  return (
    <section className="space-y-5 sc-page-enter">
      <Card className="space-y-4 p-5">
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={isLoading || modalOpen}
                onClick={reload}
                aria-label={t('refresh')}
              >
                <RefreshCw size={17} />
              </Button>
              {canOperate && (
                <Button disabled={modalOpen || isLoading} onClick={() => setEditor({ rule: null })}>
                  <Plus size={17} />
                  {t('createRule')}
                </Button>
              )}
            </div>
          }
        />
        <Tabs
          label={t('type')}
          disabled={modalOpen}
          tabs={['ALLOCATION', 'CARRIER'].map((v) => ({ id: v, label: t(`types.${v}`) }))}
          activeId={kind}
          onChange={changeKind}
        />
        <Alert variant="info">
          <p className="font-medium">{t('howItWorks')}</p>
          <p className="mt-1 text-sm">{t(`howItWorksHint.${kind}`)}</p>
          {hasPendingDraft && <p className="mt-1 text-sm">{t('draftPending')}</p>}
        </Alert>
        {kind === 'CARRIER' && !isLoading && !error && (
          <CarrierPlan
            rule={defaultRule}
            serviceNames={serviceNames}
            areServicesReady={areServicesReady}
          />
        )}
        {dirty && (
          <Alert variant="warning">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{t('orderUnsaved')}</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={modalOpen} onClick={() => setOrder(items)}>
                  {t('discardOrder')}
                </Button>
                <Button
                  disabled={modalOpen}
                  onClick={() => setCommand({ operation: 'reorder', items: order })}
                >
                  {t('saveOrder')}
                </Button>
              </div>
            </div>
          </Alert>
        )}
        {isLoading ? (
          <div
            role="status"
            className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-10"
          >
            {t('loading')}
          </div>
        ) : error ? (
          <Alert variant="error">
            {error}
            <Button variant="outline" onClick={reload}>
              {t('retry')}
            </Button>
          </Alert>
        ) : order.length === 0 ? (
          <div className="rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-12 text-center">
            <h2 className="font-medium">{t('empty')}</h2>
            <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">{t('emptyHint')}</p>
          </div>
        ) : (
          <ol aria-label={t('title')} className="space-y-3">
            {order.map((rule, index) => (
              <li
                key={rule.id}
                className={cn(
                  'rounded-2xl border border-l-4 border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-4 transition-shadow duration-150 hover:shadow-[var(--sc-shadow-button)]',
                  rule.isEnabled
                    ? 'border-l-[var(--sc-primary)]'
                    : 'border-l-[var(--sc-border-strong)]',
                )}
                draggable={canOperate && !modalOpen && !isLoading}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', rule.id)}
                onDragOver={(e) => {
                  if (canOperate && !modalOpen) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  moved(e.dataTransfer.getData('text/plain'), rule.id);
                }}
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex items-center gap-1">
                    {canOperate && (
                      <GripVertical
                        size={18}
                        className="cursor-grab text-[var(--sc-text-tertiary)]"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] px-2 text-sm font-semibold tabular-nums text-[var(--sc-primary-dark)]"
                      title={t('priorityValue', { priority: rule.priority })}
                    >
                      {index + 1}
                    </span>
                    {canOperate && (
                      <div className="flex flex-col">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          aria-label={t('moveRuleUp', { name: rule.name })}
                          disabled={index === 0 || modalOpen}
                          onClick={() => {
                            const previous = order[index - 1];
                            if (previous) moved(rule.id, previous.id);
                          }}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          aria-label={t('moveRuleDown', { name: rule.name })}
                          disabled={index === order.length - 1 || modalOpen}
                          onClick={() => {
                            const next = order[index + 1];
                            if (next) moved(rule.id, next.id);
                          }}
                        >
                          <ArrowDown size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="min-w-64 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <strong className="text-[15px]">{rule.name}</strong>
                      <Badge
                        status={rule.isEnabled ? 'success' : 'default'}
                        label={t(rule.isEnabled ? 'statusOn' : 'statusOff')}
                      />
                      {rule.id === defaultRule?.id && (
                        <Badge status="info" label={t('defaultRule')} />
                      )}
                      {rule.publishedVersion !== null && rule.version > rule.publishedVersion && (
                        <Badge status="warning" label={t('draftChanges')} />
                      )}
                      <span className="text-xs text-[var(--sc-text-secondary)]">
                        {rule.warehouseId ? t('warehouseScope') : t('allWarehouses')}
                        {rule.exceptionTenantId ? ` · ${t('sellerSpecific')}` : ''}
                      </span>
                    </div>
                    <RuleSentence
                      condition={rule.condition}
                      action={rule.action}
                      serviceNames={serviceNames}
                      areServicesReady={areServicesReady}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {canOperate &&
                      (!rule.isEnabled || rule.version > (rule.publishedVersion ?? 0)) && (
                        <Button
                          size="sm"
                          disabled={modalOpen || dirty}
                          onClick={() => setCommand({ operation: 'publish', rule })}
                        >
                          {t('publish')}
                        </Button>
                      )}
                    {canOperate && (
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={modalOpen || dirty}
                        onClick={() => setEditor({ rule })}
                      >
                        {t('edit')}
                      </Button>
                    )}
                    <span
                      aria-hidden="true"
                      className="mx-1 h-5 w-px bg-[var(--sc-border-default)]"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      title={t('history')}
                      aria-label={`${t('history')}: ${rule.name}`}
                      disabled={modalOpen || dirty}
                      onClick={() => setHistory(rule)}
                    >
                      <History size={16} />
                    </Button>
                    {canOperate && rule.isEnabled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title={t('disable')}
                        aria-label={`${t('disable')}: ${rule.name}`}
                        disabled={modalOpen || dirty}
                        onClick={() => setCommand({ operation: 'disable', rule })}
                      >
                        <Power size={16} />
                      </Button>
                    )}
                    {canOperate && (
                      <Button
                        size="sm"
                        variant="softDanger"
                        title={t('delete')}
                        aria-label={`${t('delete')}: ${rule.name}`}
                        disabled={modalOpen || dirty}
                        onClick={() => setCommand({ operation: 'delete', rule })}
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <details className="group mt-4 rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl p-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--sc-primary)]">
            <FlaskConical size={18} aria-hidden="true" className="text-[var(--sc-primary)]" />
            {t('simulatorToggle')}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="ml-auto text-[var(--sc-text-secondary)] transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-[var(--sc-border-default)] p-4">
            <RuleSimulator key={kind} kind={kind} rules={items} />
          </div>
        </details>
      </Card>
      {editor && (
        <RuleEditor
          rule={editor.rule}
          kind={kind}
          nextPriority={items.reduce((max, r) => Math.max(max, r.priority), -1) + 1}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {history && (
        <RuleHistory
          rule={history}
          onClose={() => setHistory(null)}
          onRollback={(version) => {
            if (canOperate) {
              setCommand({ operation: 'rollback', rule: history, targetVersion: version });
              setHistory(null);
            }
          }}
        />
      )}
      {command && (
        <RuleCommand command={command} onClose={() => setCommand(null)} onSaved={saved} />
      )}
    </section>
  );
}
export function RulesWorkspace() {
  const principal = useAuthStore((s) => s.user);
  const { can } = useAccess();
  const t = useTranslations('Rules');
  if (!can('routing.rule.set')) return <Alert variant="error">{t('forbidden')}</Alert>;
  return <ScopedRules key={JSON.stringify(principal)} />;
}
