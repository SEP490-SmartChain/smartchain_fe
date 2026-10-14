import { useEffect, useState } from 'react';

import { ArrowDown, ArrowUp, GripVertical, Plus, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Select } from '@/components/Common/Select/Select';
import { useAccess } from '@/hooks/useAccess';
import { useAuthStore } from '@/stores/authStore';

import { RuleCommand, type Command } from './RuleCommand';
import { RuleEditor } from './RuleEditor';
import { RuleHistory } from './RuleHistory';
import { RuleSimulator } from './RuleSimulator';
import { useRuleList } from '../hooks/useRuleList';
import { moveRule } from '../lib/rulePriority';

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
  useEffect(() => {
    setOrder(items);
  }, [items]);
  const dirty = order.some((r, i) => r.id !== items[i]?.id);
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
    <div className="space-y-5 sc-page-enter">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--sc-text-primary)]">{t('title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--sc-text-secondary)]">{t('subtitle')}</p>
        </div>
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
      </header>
      <div className="max-w-sm">
        <Select
          label={t('type')}
          value={kind}
          options={['ALLOCATION', 'CARRIER'].map((v) => ({ value: v, label: t(`types.${v}`) }))}
          disabled={modalOpen}
          onChange={(e) => changeKind(e.target.value)}
        />
      </div>
      <Alert>{t('draftNotice')}</Alert>
      <RuleSimulator key={kind} kind={kind} rules={items} />
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
        <div className="overflow-x-auto rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)]">
          <table className="w-full text-left text-sm" aria-label={t('title')}>
            <thead className="bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]">
              <tr>
                {['order', 'name', 'scope', 'publication', 'actions'].map((v) => (
                  <th key={v} className="px-4 py-3 font-medium">
                    {t(v)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((rule, index) => (
                <tr
                  key={rule.id}
                  className="border-t border-[var(--sc-border-default)]"
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
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <GripVertical
                        size={16}
                        className="text-[var(--sc-text-tertiary)]"
                        aria-hidden="true"
                      />
                      <span>{dirty ? index : rule.priority}</span>
                      {canOperate && (
                        <div className="flex flex-col">
                          <Button
                            size="sm"
                            variant="ghost"
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
                  </td>
                  <td className="p-4">
                    <strong>{rule.name}</strong>
                    <p className="mt-1 max-w-60 break-all text-xs text-[var(--sc-text-secondary)]">
                      {t('version', { version: rule.version })}
                    </p>
                  </td>
                  <td className="p-4">
                    <p>{rule.warehouseId ? t('warehouseScope') : t('allWarehouses')}</p>
                    {rule.exceptionTenantId && (
                      <p className="mt-1 text-xs text-[var(--sc-text-secondary)]">
                        {t('sellerSpecific')}
                      </p>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge
                      status={rule.isEnabled ? 'success' : 'default'}
                      label={
                        rule.publishedVersion
                          ? t('effectiveVersion', { version: rule.publishedVersion })
                          : t('disabled')
                      }
                    />
                    {rule.publishedVersion !== null && rule.version > rule.publishedVersion && (
                      <p className="mt-2 text-xs text-[var(--sc-warning-dark)]">
                        {t('draftChanges')}
                      </p>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex min-w-64 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={modalOpen || dirty}
                        onClick={() => setHistory(rule)}
                      >
                        {t('history')}
                      </Button>
                      {canOperate && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={modalOpen || dirty}
                            onClick={() => setEditor({ rule })}
                          >
                            {t('edit')}
                          </Button>
                          <Button
                            size="sm"
                            disabled={modalOpen || dirty}
                            onClick={() => setCommand({ operation: 'publish', rule })}
                          >
                            {t('publish')}
                          </Button>
                          {rule.isEnabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={modalOpen || dirty}
                              onClick={() => setCommand({ operation: 'disable', rule })}
                            >
                              {t('disable')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={modalOpen || dirty}
                            onClick={() => setCommand({ operation: 'delete', rule })}
                          >
                            {t('delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editor && (
        <RuleEditor
          rule={editor.rule}
          kind={kind}
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
    </div>
  );
}
export function RulesWorkspace() {
  const principal = useAuthStore((s) => s.user);
  const { can } = useAccess();
  const t = useTranslations('Rules');
  if (!can('routing.rule.set')) return <Alert variant="error">{t('forbidden')}</Alert>;
  return <ScopedRules key={JSON.stringify(principal)} />;
}
