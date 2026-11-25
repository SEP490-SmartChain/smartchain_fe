import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/Common/Button/Button';
import { cn } from '@/lib/utils';

import { formatNotificationText, type NotificationTranslator } from './formatNotificationText';
import {
  sanitizeRealtimeTargetPath,
  type InAppNotificationDto,
  type RealtimeCategory,
  type RealtimeConnectionStatus,
  type RealtimeSeverity,
} from '../../shared';

export type NotificationBellFilter = 'all' | 'unread';

export interface NotificationBellLabels {
  readonly title?: string;
  readonly markAllRead?: string;
  readonly empty?: string;
  readonly allTab?: string;
  readonly unreadTab?: string;
  readonly live?: string;
  readonly offline?: string;
  readonly allCategories?: string;
}

export interface NotificationBellPopoverProps {
  readonly items: readonly InAppNotificationDto[];
  readonly unreadCount: number;
  readonly connectionStatus?: RealtimeConnectionStatus;
  readonly onMarkRead?: (id: string) => void | Promise<void>;
  readonly onMarkAllRead?: () => void | Promise<void>;
  readonly onNavigate?: (targetPath: string, notification: InAppNotificationDto) => void;
  readonly translate?: NotificationTranslator;
  readonly labels?: NotificationBellLabels;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly now?: Date | string | number;
  readonly className?: string;
}

interface ResolvedLabels {
  readonly title: string;
  readonly markAllRead: string;
  readonly empty: string;
  readonly allTab: string;
  readonly unreadTab: string;
  readonly live: string;
  readonly offline: string;
  readonly allCategories: string;
}

const DEFAULT_LABELS: ResolvedLabels = {
  title: 'Thông báo',
  markAllRead: 'Đánh dấu đã đọc',
  empty: 'Chưa có thông báo mới',
  allTab: 'Tất cả',
  unreadTab: 'Chưa đọc',
  live: 'Trực tiếp',
  offline: 'Ngoại tuyến',
  allCategories: 'Tất cả nhóm',
};

interface SeverityPresentation {
  readonly badgeLabel: string;
  readonly badgeClass: string;
  readonly iconClass: string;
  readonly accentClass: string;
  readonly Icon: LucideIcon;
}

const SEVERITY_PRESENTATION: Readonly<Record<RealtimeSeverity, SeverityPresentation>> = {
  CRITICAL: {
    badgeLabel: 'Khẩn cấp',
    badgeClass:
      'border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] text-[var(--sc-error-dark)]',
    iconClass: 'text-[var(--sc-error)]',
    accentClass: 'border-l-2 border-l-[var(--sc-error)]',
    Icon: AlertCircle,
  },
  WARNING: {
    badgeLabel: 'Cảnh báo',
    badgeClass:
      'border border-[var(--sc-warning-border)] bg-[var(--sc-warning-bg)] text-[var(--sc-warning-dark)]',
    iconClass: 'text-[var(--sc-warning)]',
    accentClass: 'border-l-2 border-l-[var(--sc-warning)]',
    Icon: AlertTriangle,
  },
  SUCCESS: {
    badgeLabel: 'Hoàn tất',
    badgeClass:
      'border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] text-[var(--sc-success-dark)]',
    iconClass: 'text-[var(--sc-success)]',
    accentClass: 'border-l-2 border-l-[var(--sc-success)]',
    Icon: CheckCircle2,
  },
  INFO: {
    badgeLabel: 'Thông tin',
    badgeClass:
      'border border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] text-[var(--sc-info-dark)]',
    iconClass: 'text-[var(--sc-info)]',
    accentClass: 'border-l-2 border-l-[var(--sc-info)]',
    Icon: Info,
  },
};

const CATEGORY_LABELS: Readonly<Record<RealtimeCategory, string>> = {
  INBOUND: 'Nhập kho',
  OUTBOUND: 'Xuất kho',
  SHIPMENT: 'Vận đơn',
  INVENTORY: 'Tồn kho',
  ORDER: 'Đơn hàng',
  COMMERCIAL: 'Thương mại',
  FINANCE: 'Tài chính',
  CLAIM: 'Khiếu nại',
  SYSTEM: 'Hệ thống',
};

export function formatUnreadBadge(unreadCount: number): string {
  const normalized = normalizeUnreadCount(unreadCount);
  if (normalized === 0) {
    return '';
  }
  return normalized > 99 ? '99+' : String(normalized);
}

function normalizeUnreadCount(unreadCount: number): number {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) {
    return 0;
  }
  return Math.floor(unreadCount);
}

export function formatNotificationTimestamp(
  createdAt: string,
  now?: Date | string | number,
): string {
  const parsed = new Date(createdAt);
  const createdMs = parsed.getTime();
  if (Number.isNaN(createdMs)) {
    return '';
  }

  const refMs = now !== undefined ? new Date(now).getTime() : Date.now();
  if (!Number.isNaN(refMs)) {
    const diffMs = refMs - createdMs;
    if (diffMs >= 0 && diffMs < 60_000) {
      return 'Vừa xong';
    }
    if (diffMs >= 60_000 && diffMs < 3_600_000) {
      return `${Math.floor(diffMs / 60_000)} phút trước`;
    }
    if (diffMs >= 3_600_000 && diffMs < 86_400_000) {
      return `${Math.floor(diffMs / 3_600_000)} giờ trước`;
    }
    if (diffMs >= 86_400_000 && diffMs < 604_800_000) {
      return `${Math.floor(diffMs / 86_400_000)} ngày trước`;
    }
  }

  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return createdAt.slice(0, 16).replace('T', ' ');
  }
}

interface NotificationRowProps {
  readonly item: InAppNotificationDto;
  readonly translate?: NotificationTranslator;
  readonly now?: Date | string | number;
  readonly onSelect: (item: InAppNotificationDto) => void;
}

function NotificationRow({ item, translate, now, onSelect }: NotificationRowProps) {
  const { title, body } = formatNotificationText(item, translate);
  const severityUi = SEVERITY_PRESENTATION[item.severity] ?? SEVERITY_PRESENTATION.INFO;
  const SeverityIcon = severityUi.Icon;
  const timestamp = formatNotificationTimestamp(item.createdAt, now);
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        data-unread={item.isRead ? 'false' : 'true'}
        data-severity={item.severity}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg p-3 text-left transition-colors',
          severityUi.accentClass,
          item.isRead
            ? 'bg-transparent hover:bg-[var(--sc-bg-secondary)]'
            : 'bg-[var(--sc-primary-alpha-08)] hover:bg-[var(--sc-primary-alpha-12)]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            item.isRead ? 'bg-[var(--sc-border-strong)]' : 'bg-[var(--sc-primary)]',
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <SeverityIcon
                size={14}
                strokeWidth={1.75}
                aria-hidden="true"
                className={cn('shrink-0', severityUi.iconClass)}
              />
              <span
                className={cn(
                  'truncate text-sm text-[var(--sc-text-primary)]',
                  item.isRead ? 'font-medium' : 'font-semibold',
                )}
              >
                {title}
              </span>
            </span>

            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                severityUi.badgeClass,
              )}
            >
              {severityUi.badgeLabel}
            </span>
          </span>

          <span className="mt-1 block text-xs leading-4 text-[var(--sc-text-secondary)]">
            {body}
          </span>

          <span className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--sc-text-tertiary)]">
            <span>{categoryLabel}</span>
            {timestamp && (
              <>
                <span aria-hidden="true">•</span>
                <time dateTime={item.createdAt}>{timestamp}</time>
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Controlled notification bell trigger and popover panel for ORCA realtime notifications.
 * Designed for seamless SSR and Topbar composition without coupling to store implementations.
 */
export function NotificationBellPopover({
  items,
  unreadCount,
  connectionStatus,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  translate,
  labels,
  defaultOpen = false,
  open,
  onOpenChange,
  now,
  className,
}: NotificationBellPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [activeFilter, setActiveFilter] = useState<NotificationBellFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<RealtimeCategory | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen = open ?? internalOpen;
  const normalizedUnread = normalizeUnreadCount(unreadCount);
  const badgeText = formatUnreadBadge(normalizedUnread);
  const isConnected = connectionStatus === 'connected';

  const resolvedLabels = useMemo<ResolvedLabels>(
    () => ({
      title: labels?.title ?? DEFAULT_LABELS.title,
      markAllRead: labels?.markAllRead ?? DEFAULT_LABELS.markAllRead,
      empty: labels?.empty ?? DEFAULT_LABELS.empty,
      allTab: labels?.allTab ?? DEFAULT_LABELS.allTab,
      unreadTab: labels?.unreadTab ?? DEFAULT_LABELS.unreadTab,
      live: labels?.live ?? DEFAULT_LABELS.live,
      offline: labels?.offline ?? DEFAULT_LABELS.offline,
      allCategories: labels?.allCategories ?? DEFAULT_LABELS.allCategories,
    }),
    [labels],
  );

  const openRef = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    openRef.current = open;
    onOpenChangeRef.current = onOpenChange;
  }, [open, onOpenChange]);

  const setOpenState = useCallback((nextOpen: boolean) => {
    if (openRef.current === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChangeRef.current?.(nextOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenState(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenState(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpenState]);

  const presentCategories = useMemo<readonly RealtimeCategory[]>(() => {
    const seen = new Set<RealtimeCategory>();
    for (const item of items) {
      seen.add(item.category);
    }
    return [...seen];
  }, [items]);

  const effectiveCategory =
    selectedCategory && presentCategories.includes(selectedCategory) ? selectedCategory : null;

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (activeFilter === 'unread' && item.isRead) {
          return false;
        }
        if (effectiveCategory !== null && item.category !== effectiveCategory) {
          return false;
        }
        return true;
      }),
    [items, activeFilter, effectiveCategory],
  );

  const handleMarkAllRead = () => {
    if (normalizedUnread === 0 || !onMarkAllRead) {
      return;
    }
    void Promise.resolve(onMarkAllRead()).catch(() => undefined);
  };

  const handleItemSelect = (item: InAppNotificationDto) => {
    if (!item.isRead && onMarkRead) {
      void Promise.resolve(onMarkRead(item.id)).catch(() => undefined);
    }
    if (onNavigate) {
      onNavigate(sanitizeRealtimeTargetPath(item.targetPath), item);
      setOpenState(false);
    }
  };

  const triggerAriaLabel =
    badgeText !== '' ? `${resolvedLabels.title} (${badgeText})` : resolvedLabels.title;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        className="sc-icon-button relative"
        onClick={() => setOpenState(!isOpen)}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-connection-status={connectionStatus ?? 'idle'}
      >
        <Bell
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className={cn(normalizedUnread > 0 && 'sc-notification-ring')}
        />

        {isConnected && (
          <span
            data-testid="notification-live-indicator"
            title={resolvedLabels.live}
            aria-label={resolvedLabels.live}
            className="absolute bottom-1 left-1 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-[var(--sc-bg-surface)]"
          />
        )}

        {normalizedUnread > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--sc-error)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--sc-bg-surface)]"
          >
            {badgeText}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={resolvedLabels.title}
          className="sc-popover-enter fixed left-4 right-4 top-[72px] z-50 overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-elevated)] shadow-[var(--sc-shadow-popover)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[420px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--sc-border-default)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="m-0 truncate text-base font-medium text-[var(--sc-text-primary)]">
                {resolvedLabels.title}
              </h2>
              {connectionStatus !== undefined && (
                <span
                  data-testid="notification-connection-pill"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[var(--sc-bg-secondary)] text-[var(--sc-text-tertiary)]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isConnected ? 'bg-emerald-500' : 'bg-[var(--sc-text-tertiary)]',
                    )}
                  />
                  {isConnected ? resolvedLabels.live : resolvedLabels.offline}
                </span>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={normalizedUnread === 0}
              className="h-auto rounded px-2 py-1 text-xs font-medium text-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)]"
            >
              {resolvedLabels.markAllRead}
            </Button>
          </div>

          <div className="border-b border-[var(--sc-border-light)] px-3 py-2">
            <div
              role="tablist"
              aria-label={resolvedLabels.title}
              className="flex items-center gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'all'}
                onClick={() => setActiveFilter('all')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeFilter === 'all'
                    ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                    : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]',
                )}
              >
                {resolvedLabels.allTab}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'unread'}
                onClick={() => setActiveFilter('unread')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeFilter === 'unread'
                    ? 'bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]'
                    : 'text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]',
                )}
              >
                <span>{resolvedLabels.unreadTab}</span>
                {normalizedUnread > 0 && (
                  <span className="rounded-full bg-[var(--sc-bg-surface)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--sc-text-primary)]">
                    {badgeText}
                  </span>
                )}
              </button>
            </div>

            {presentCategories.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    effectiveCategory === null
                      ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)] font-medium text-[var(--sc-primary-dark)]'
                      : 'border-[var(--sc-border-default)] text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]',
                  )}
                >
                  {resolvedLabels.allCategories}
                </button>
                {presentCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((prev) => (prev === category ? null : category))
                    }
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                      effectiveCategory === category
                        ? 'border-[var(--sc-primary)] bg-[var(--sc-primary-alpha-08)] font-medium text-[var(--sc-primary-dark)]'
                        : 'border-[var(--sc-border-default)] text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-secondary)]',
                    )}
                  >
                    {CATEGORY_LABELS[category] ?? category}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="max-h-[405px] space-y-1 overflow-y-auto p-1.5">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  translate={translate}
                  now={now}
                  onSelect={handleItemSelect}
                />
              ))
            ) : (
              <li className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <BellOff
                  size={24}
                  strokeWidth={1.35}
                  aria-hidden="true"
                  className="text-[var(--sc-text-tertiary)]"
                />
                <p className="m-0 mt-2 text-sm text-[var(--sc-text-secondary)]">
                  {resolvedLabels.empty}
                </p>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
