import type { RuleCondition, RuleField, RuleRecord, RuleValue } from '../types/rule.types';

export interface ConditionLabels {
  field: (field: RuleField) => string;
  operator: (operator: string) => string;
  boolean: (value: boolean) => string;
}

export interface ConditionSummary {
  joiner: 'ALL' | 'ANY';
  clauses: string[];
}

function valueText(value: RuleValue, labels: ConditionLabels): string {
  return typeof value === 'boolean' ? labels.boolean(value) : String(value);
}

function clauseText(condition: RuleCondition, labels: ConditionLabels): string | null {
  if (condition.kind === 'PREDICATE') {
    const head = `${labels.field(condition.field)} ${labels.operator(condition.operator)}`;
    if (condition.operator === 'EXISTS') return head;
    if ('values' in condition) {
      return `${head} ${condition.values.map((v) => valueText(v, labels)).join(', ')}`;
    }
    return `${head} ${valueText(condition.value, labels)}`;
  }
  const parts = condition.conditions
    .map((child) => clauseText(child, labels))
    .filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;
  return `(${parts.join(condition.kind === 'ALL' ? ' + ' : ' / ')})`;
}

/** A group without any predicate matches every order. */
export function matchesEveryOrder(condition: RuleCondition): boolean {
  return condition.kind !== 'PREDICATE' && condition.conditions.every(matchesEveryOrder);
}

/** The carrier rule that catches every order: first enabled, unconditional, unscoped, in list order. */
export function findDefaultCarrierRule(rules: readonly RuleRecord[]): RuleRecord | null {
  return (
    rules.find(
      (rule) =>
        rule.kind === 'CARRIER' &&
        rule.isEnabled &&
        rule.warehouseId === null &&
        rule.exceptionTenantId === null &&
        'carrierServiceId' in rule.action &&
        matchesEveryOrder(rule.condition),
    ) ?? null
  );
}

/** Flattens the top-level group into readable clauses; an empty group matches every order. */
export function summarizeCondition(
  condition: RuleCondition,
  labels: ConditionLabels,
): ConditionSummary {
  if (condition.kind === 'PREDICATE') {
    return { joiner: 'ALL', clauses: [clauseText(condition, labels) ?? ''] };
  }
  return {
    joiner: condition.kind,
    clauses: condition.conditions
      .map((child) => clauseText(child, labels))
      .filter((part): part is string => part !== null),
  };
}
