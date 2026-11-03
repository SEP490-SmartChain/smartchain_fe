export const RULE_FIELDS = {
  tenantId: 'TEXT',
  provinceCode: 'TEXT',
  wardCode: 'TEXT',
  warehouseId: 'TEXT',
  weightG: 'INTEGER',
  itemCount: 'INTEGER',
  codAmountVnd: 'VND',
  isCod: 'BOOLEAN',
} as const;
export type RuleField = keyof typeof RULE_FIELDS;
export type RuleKind = 'ALLOCATION' | 'CARRIER';
export type RuleValue = string | number | boolean;
export type RuleCondition =
  | { kind: 'ALL' | 'ANY'; conditions: RuleCondition[] }
  | { kind: 'PREDICATE'; field: RuleField; operator: 'EXISTS' }
  | { kind: 'PREDICATE'; field: RuleField; operator: 'IN' | 'NOT_IN'; values: RuleValue[] }
  | {
      kind: 'PREDICATE';
      field: RuleField;
      operator: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE';
      value: RuleValue;
    };
export type AllocationStrategy = 'NEAREST_WAREHOUSE' | 'EXPIRY_FIRST' | 'TOTAL_COST';
export type RuleAction =
  | { strategy: AllocationStrategy }
  | { carrierServiceId: string; fallbackServiceIds: string[] };
export interface RuleDefinition {
  name: string;
  kind: RuleKind;
  warehouseId: string | null;
  exceptionTenantId: string | null;
  priority: number;
  condition: RuleCondition;
  action: RuleAction;
}
export interface RuleRecord extends RuleDefinition {
  id: string;
  version: number;
  publishedVersion: number | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type RuleOperation =
  | 'CREATE'
  | 'EDIT'
  | 'PUBLISH'
  | 'DISABLE'
  | 'ROLLBACK'
  | 'DELETE'
  | 'REORDER';
export interface RuleVersion {
  version: number;
  definition: RuleDefinition;
  operation: RuleOperation;
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface RuleTarget {
  id: string;
  name: string;
}
export type TargetKind = 'WAREHOUSE' | 'CARRIER_SERVICE';
