export interface WebhookEventTopicDefinition {
  id: string;
  category: 'orders' | 'shipping' | 'inventory_finance';
  nameKey: string;
  descKey: string;
}

/**
 * Webhook Event Topics defined according to SRS Report 3 (FE-14 / BUC-09, Section 3.2.1).
 * Grouped logically into categories for user-centric UI display.
 */
export const WEBHOOK_EVENT_TOPICS: WebhookEventTopicDefinition[] = [
  {
    id: 'order.ingested',
    category: 'orders',
    nameKey: 'topicOrderIngested',
    descKey: 'topicOrderIngestedDesc',
  },
  {
    id: 'order.routed',
    category: 'orders',
    nameKey: 'topicOrderRouted',
    descKey: 'topicOrderRoutedDesc',
  },
  {
    id: 'order.sla_breach',
    category: 'orders',
    nameKey: 'topicOrderSlaBreach',
    descKey: 'topicOrderSlaBreachDesc',
  },
  {
    id: 'carrier.status_update',
    category: 'shipping',
    nameKey: 'topicCarrierStatusUpdate',
    descKey: 'topicCarrierStatusUpdateDesc',
  },
  {
    id: 'inventory.low_stock',
    category: 'inventory_finance',
    nameKey: 'topicInventoryLowStock',
    descKey: 'topicInventoryLowStockDesc',
  },
  {
    id: 'recon.completed',
    category: 'inventory_finance',
    nameKey: 'topicReconCompleted',
    descKey: 'topicReconCompletedDesc',
  },
];

export type WebhookEventTopic = (typeof WEBHOOK_EVENT_TOPICS)[number]['id'];

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secret?: string;
  maskedSecret?: string | null;
  hasSecret: boolean;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookPayload {
  url: string;
  secret?: string;
  eventTypes: string[];
  isActive?: boolean;
}

export interface UpdateWebhookPayload {
  url?: string;
  secret?: string;
  eventTypes?: string[];
  isActive?: boolean;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  message: string;
  error?: string;
}
