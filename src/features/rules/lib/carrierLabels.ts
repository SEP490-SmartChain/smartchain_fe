import type { RuleRecord } from '../types/rule.types';

/** Temporary labels for the two legacy service names confirmed in the current carrier catalogue. */
export function carrierServiceLabel(name: string): string {
  const legacyName = name.trim();
  switch (legacyName) {
    case 'Hàng nhẹ':
      return `GHN · ${legacyName}`;
    case 'Đường bộ':
      return `GHTK · ${legacyName}`;
    default:
      return name;
  }
}

/** Decorates the generated title's final service label without changing the saved rule name. */
export function ruleDisplayName(rule: Pick<RuleRecord, 'kind' | 'name'>): string {
  if (rule.kind !== 'CARRIER') return rule.name;
  const separator = rule.name.lastIndexOf('→');
  if (separator === -1) return rule.name;
  const service = rule.name.slice(separator + 1).trim();
  const label = carrierServiceLabel(service);
  return label === service ? rule.name : `${rule.name.slice(0, separator + 1)} ${label}`;
}
