import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import { Select } from '@/components/Common/Select/Select';

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
    Array.from({ length: childCount }, () => crypto.randomUUID()),
  );
  if (childKeys.length !== childCount) {
    setChildKeys(Array.from({ length: childCount }, () => crypto.randomUUID()));
  }
  const changeKind = (kind: string) =>
    onChange(
      kind === 'PREDICATE'
        ? { ...DEFAULT }
        : {
            kind: kind === 'ANY' ? 'ANY' : 'ALL',
            conditions: kind === 'ANY' ? [{ ...DEFAULT }] : [],
          },
    );
  const modes = ['ALL', 'ANY', 'PREDICATE'].map((v) => ({ value: v, label: t(`conditions.${v}`) }));
  if ('conditions' in value) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-44 flex-1">
            <Select
              aria-required
              label={t('conditionMode')}
              value={value.kind}
              options={modes}
              disabled={disabled}
              onChange={(e) => changeKind(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || depth >= 8 || value.conditions.length >= 50}
            onClick={() => {
              setChildKeys((keys) => [...keys, crypto.randomUUID()]);
              onChange({ ...value, conditions: [...value.conditions, { ...DEFAULT }] });
            }}
          >
            {t('addCondition')}
          </Button>
        </div>
        {value.conditions.length === 0 && (
          <p className="text-sm text-[var(--sc-text-secondary)]">{t('matchAll')}</p>
        )}
        {value.conditions.map((child, index) => (
          <div key={childKeys[index]} className="space-y-2">
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setChildKeys((keys) => keys.filter((_, i) => i !== index));
                onChange({ ...value, conditions: value.conditions.filter((_, i) => i !== index) });
              }}
            >
              {t('removeCondition', { number: index + 1 })}
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
  return (
    <div className="space-y-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] p-3">
      <Select
        aria-required
        label={t('conditionMode')}
        value="PREDICATE"
        options={modes}
        disabled={disabled || depth >= 8}
        onChange={(e) => changeKind(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          aria-required
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
          aria-required
          label={t('operator')}
          value={value.operator}
          options={operators.map((op) => ({ value: op, label: t(`operators.${op}`) }))}
          disabled={disabled}
          onChange={(e) => changeOperator(e.target.value)}
        />
        {value.operator !== 'EXISTS' &&
          (RULE_FIELDS[value.field] === 'BOOLEAN' && 'value' in value ? (
            <Select
              aria-required
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
              aria-required
              label={t('value')}
              value={text}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              disabled={disabled}
              onChange={(e) => changeValue(e.target.value)}
            />
          ) : (
            <Input
              aria-required
              label={t('value')}
              value={text}
              disabled={disabled}
              helperText={
                'values' in value ? t('listHint') : t(`units.${RULE_FIELDS[value.field]}`)
              }
              onChange={(e) => changeValue(e.target.value)}
            />
          ))}
      </div>
    </div>
  );
}
