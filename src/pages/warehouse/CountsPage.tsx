import { InventoryWorkflowWorkspace } from '@/features/inventory';

/**
 * UC-57–UC-59 cycle count: the Manager plans, assigns, reviews and posts; Staff count blind.
 * The screenshot-visible placeholder is replaced by the real feature workspace.
 */
export default function CountsPage() {
  return <InventoryWorkflowWorkspace initialTab="counts" />;
}
