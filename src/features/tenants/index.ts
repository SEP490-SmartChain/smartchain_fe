/**
 * Public API của feature `tenants`.
 *
 * Feature khác CHỈ được import qua file này — không với tay vào file nội bộ.
 * (FE dependency rule #2, SDD mục 1.2.1)
 */
export { StaffAccountDirectory } from './components/StaffAccountDirectory';
export { WebhookManager } from './components/WebhookManager';
export { useStaffAccounts } from './hooks/useStaffAccounts';
export { useWebhooks } from './hooks/useWebhooks';
export type {
  StaffAccount,
  StaffAccountFilters,
  StaffAccountStatus,
  StaffRole,
} from './types/staffAccount.types';
export type {
  CreateWebhookPayload,
  UpdateWebhookPayload,
  WebhookEndpoint,
  WebhookEventTopic,
  WebhookTestResult,
} from './types/webhook.types';

