import { toast } from 'sonner';

import { formatNotificationText, type NotificationTranslator } from './formatNotificationText';
import {
  sanitizeRealtimeTargetPath,
  type InAppNotificationDto,
  type RealtimeSeverity,
} from '../../shared';

export interface ToastActionLike {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastCallOptions {
  readonly description?: string;
  readonly duration?: number;
  readonly action?: ToastActionLike;
}

export interface ToastLike {
  error(title: string, options?: ToastCallOptions): string | number | void;
  warning(title: string, options?: ToastCallOptions): string | number | void;
  success(title: string, options?: ToastCallOptions): string | number | void;
  info(title: string, options?: ToastCallOptions): string | number | void;
}

export interface PresentRealtimeToastOptions {
  readonly translate?: NotificationTranslator;
  readonly onNavigate?: (targetPath: string, notification: InAppNotificationDto) => void;
  readonly toastApi?: ToastLike;
  readonly actionLabel?: string;
}

interface SeverityToastConfig {
  readonly method: keyof ToastLike;
  readonly duration: number;
}

const TOAST_SEVERITY_CONFIG: Readonly<Record<RealtimeSeverity, SeverityToastConfig>> = {
  CRITICAL: { method: 'error', duration: 10000 },
  WARNING: { method: 'warning', duration: 7000 },
  SUCCESS: { method: 'success', duration: 5000 },
  INFO: { method: 'info', duration: 4500 },
};

const DEFAULT_ACTION_LABEL = 'Xem chi tiết';

/**
 * Presents a Sonner-compatible toast for an incoming realtime notification,
 * mapping severity to toast method/duration and sanitizing navigation targets.
 */
export function presentRealtimeToast(
  notification: InAppNotificationDto,
  options: PresentRealtimeToastOptions = {},
): string | number | void {
  const { translate, onNavigate, toastApi = toast, actionLabel = DEFAULT_ACTION_LABEL } = options;
  const { title, body } = formatNotificationText(notification, translate);
  const config = TOAST_SEVERITY_CONFIG[notification.severity] ?? TOAST_SEVERITY_CONFIG.INFO;
  const safeTargetPath = sanitizeRealtimeTargetPath(notification.targetPath);

  const action: ToastActionLike | undefined = onNavigate
    ? {
        label: actionLabel,
        onClick: () => {
          onNavigate(safeTargetPath, notification);
        },
      }
    : undefined;

  const callOptions: ToastCallOptions = action
    ? { description: body, duration: config.duration, action }
    : { description: body, duration: config.duration };

  return toastApi[config.method](title, callOptions);
}
