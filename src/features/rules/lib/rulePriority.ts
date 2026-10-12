import type { RuleRecord } from '../types/rule.types';

/** Reorder one complete rule-kind collection; effective priorities remain published snapshots. */
export function moveRule(items: readonly RuleRecord[], fromId: string, toId: string): RuleRecord[] {
  const from = items.findIndex((r) => r.id === fromId),
    to = items.findIndex((r) => r.id === toId);
  if (from < 0 || to < 0 || from === to) return [...items];
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item) result.splice(to, 0, item);
  return result;
}
export function priorityEntries(
  items: readonly RuleRecord[],
): { id: string; expectedVersion: number; priority: number }[] {
  if (
    !items.length ||
    items.length > 500 ||
    new Set(items.map((r) => r.id)).size !== items.length ||
    new Set(items.map((r) => r.kind)).size !== 1
  ) {
    throw new Error('Invalid priority collection');
  }
  return items.map((r, index) => ({ id: r.id, expectedVersion: r.version, priority: index }));
}
