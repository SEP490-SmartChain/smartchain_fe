import { useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';
import { createUuid } from '@/lib/uuid';

import {
  RULE_FIELDS,
  type RuleCondition,
  type RuleField,
  type RuleTarget,
  type RuleValue,
} from '../types/rule.types';

interface ConditionEditorProps {
  value: RuleCondition;
  onChange: (value: RuleCondition) => void;
  depth?: number;
  warehouses: RuleTarget[];
  disabled?: boolean;
}
const FIELDS = Object.keys(RULE_FIELDS) as RuleField[];
const DEFAULT: RuleCondition = {
  kind: 'PREDICATE',
  field: 'provinceCode',
  operator: 'EQ',
  value: '',
};
function fieldValue(field: RuleField, text: string): RuleValue {
  if (RULE_FIELDS[field] === 'INTEGER') return /^(0|[1-9]\d*)$/.test(text) ? Number(text) : text;
  if (RULE_FIELDS[field] === 'BOOLEAN') {
    return text === 'true' ? true : text === 'false' ? false : text;
  }
  return text;
}
export function ConditionEditor({
  value,
  onChange,
  depth = 1,
  warehouses,
  disabled = false,
}: ConditionEditorProps) {
  const t = useTranslations('Rules');
  const childCount = 'conditions' in value ? value.conditions.length : 0;
  const [childKeys, setChildKeys] = useState(() =>
    Array.from({ length: childCount }, () => createUuid()),
  );
  if (childKeys.length !== childCount) {
    setChildKeys(Array.from({ length: childCount }, () => createUuid()));
  }
  if ('conditions' in value) {
    const canAdd = !disabled && depth < 8 && value.conditions.length < 50;
    return (
      <div className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Select
              label={t('conditionMode')}
              value={value.kind}
              options={[
                { value: 'ALL', label: t('groupAll') },
                { value: 'ANY', label: t('groupAny') },
              ]}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...value, kind: e.target.value === 'ANY' ? 'ANY' : 'ALL' })
              }
            />
          </div>
          <Button
            type="button"
            variant="soft"
            disabled={!canAdd}
            onClick={() => {
              setChildKeys((keys) => [...keys, createUuid()]);
              onChange({ ...value, conditions: [...value.conditions, { ...DEFAULT }] });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t('addCondition')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canAdd}
            onClick={() => {
              setChildKeys((keys) => [...keys, createUuid()]);
              onChange({
                ...value,
                conditions: [...value.conditions, { kind: 'ALL', conditions: [{ ...DEFAULT }] }],
              });
            }}
          >
            {t('addGroup')}
          </Button>
        </div>
        {value.conditions.length === 0 && (
          <p className="rounded-lg border border-dashed border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] px-3 py-2.5 text-sm text-[var(--sc-text-secondary)]">
            {t('matchAll')}
          </p>
        )}
        {value.conditions.map((child, index) => (
          <div key={childKeys[index]} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ConditionEditor
                value={child}
                depth={depth + 1}
                warehouses={warehouses}
                disabled={disabled}
                onChange={(next) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.map((c, i) => (i === index ? next : c)),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="softDanger"
              size="sm"
              className="mt-1"
              disabled={disabled}
              aria-label={t('removeCondition', { number: index + 1 })}
              onClick={() => {
                setChildKeys((keys) => keys.filter((_, i) => i !== index));
                onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) });
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              {t('remove')}
            </Button>
          </div>
        ))}
      </div>
    );
  }
  const operators =
    RULE_FIELDS[value.field] === 'TEXT' || RULE_FIELDS[value.field] === 'BOOLEAN'
      ? ['EQ', 'NE', 'IN', 'NOT_IN', 'EXISTS']
      : ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'NOT_IN', 'EXISTS'];
  const text =
    'values' in value
      ? value.values.map(String).join(', ')
      : 'value' in value
        ? String(value.value)
        : '';
  const changeValue = (text: string) => {
    if (value.operator === 'EXISTS') return;
    onChange(
      'values' in value
        ? { ...value, values: text.split(',').map((s) => fieldValue(value.field, s.trim())) }
        : { ...value, value: fieldValue(value.field, text) },
    );
  };
  const changeOperator = (operator: string) => {
    if (operator === 'EXISTS') onChange({ kind: 'PREDICATE', field: value.field, operator });
    else if (operator === 'IN' || operator === 'NOT_IN') {
      onChange({
        kind: 'PREDICATE',
        field: value.field,
        operator,
        values: text ? text.split(',').map((s) => fieldValue(value.field, s.trim())) : [],
      });
    } else if (
      operator === 'EQ' ||
      operator === 'NE' ||
      operator === 'GT' ||
      operator === 'GTE' ||
      operator === 'LT' ||
      operator === 'LTE'
    ) {
      onChange({
        kind: 'PREDICATE',
        field: value.field,
        operator,
        value: fieldValue(value.field, text),
      });
    }
  };
  const valueHint =
    'values' in value
      ? value.field === 'provinceCode'
        ? t('valueHints.provinceListCode')
        : t('listHint')
      : value.field === 'provinceCode'
        ? t('valueHints.provinceCode')
        : t(`units.${RULE_FIELDS[value.field]}`);
  return (
    <div className="grid gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3 sm:grid-cols-3">
      <Select
        label={t('field')}
        value={value.field}
        options={FIELDS.map((f) => ({ value: f, label: t(`fields.${f}`) }))}
        disabled={disabled}
        onChange={(e) => {
          const field = FIELDS.find((f) => f === e.target.value);
          if (field) {
            onChange({
              kind: 'PREDICATE',
              field,
              operator: 'EQ',
              value: RULE_FIELDS[field] === 'BOOLEAN' ? false : '',
            });
          }
        }}
      />
      <Select
        label={t('operator')}
        value={value.operator}
        options={operators.map((op) => ({ value: op, label: t(`operators.${op}`) }))}
        disabled={disabled}
        onChange={(e) => changeOperator(e.target.value)}
      />
      {value.operator !== 'EXISTS' &&
        (RULE_FIELDS[value.field] === 'BOOLEAN' && 'value' in value ? (
          <Select
            label={t('value')}
            value={text}
            options={[
              { value: 'true', label: t('yes') },
              { value: 'false', label: t('no') },
            ]}
            disabled={disabled}
            onChange={(e) => changeValue(e.target.value)}
          />
        ) : value.field === 'warehouseId' && 'value' in value ? (
          <Select
            label={t('value')}
            value={text}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            disabled={disabled}
            onChange={(e) => changeValue(e.target.value)}
          />
        ) : (
          <Input
            label={t('value')}
            value={text}
            disabled={disabled}
            helperText={valueHint}
            onChange={(e) => changeValue(e.target.value)}
          />
        ))}
    </div>
  );
}
