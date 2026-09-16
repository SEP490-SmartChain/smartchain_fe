import { useState } from 'react';

import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Warehouse,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert } from '@/components/Common/Alert/Alert';
import { Badge } from '@/components/Common/Badge/Badge';
import { Button } from '@/components/Common/Button/Button';
import { Card } from '@/components/Common/Card/Card';
import Modal from '@/components/Common/Modal/Modal';
import { Tabs } from '@/components/Common/Tabs/Tabs';

import type { TenantDetail } from '../types/tenant.types';

interface TenantDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantDetail | null;
  onToggleStatusClick: () => void;
}

type DetailTab = 'overview' | 'metrics' | 'audit';

export function TenantDetailModal({
  isOpen,
  onClose,
  tenant,
  onToggleStatusClick,
}: TenantDetailModalProps) {
  const t = useTranslations('AdminTenants');
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!tenant) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Đã sao chép vào bộ nhớ tạm');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const ordersPercentage =
    tenant.quota.ordersTotal > 0
      ? Math.min(Math.round((tenant.quota.ordersUsed / tenant.quota.ordersTotal) * 100), 100)
      : 0;

  const apiCallsPercentage =
    tenant.quota.apiCallsTotal > 0
      ? Math.min(Math.round((tenant.quota.apiCallsUsed / tenant.quota.apiCallsTotal) * 100), 100)
      : 0;

  const isSuspended = tenant.status === 'SUSPENDED';

  const warehouseCount = tenant.aggregates?.activeWarehouseCount ?? 0;
  const orderCount = tenant.aggregates?.currentMonthOrderCount ?? tenant.quota.ordersUsed;
  const carrierCount = tenant.aggregates?.connectedCarrierCount ?? 0;

  const domainUrl = `${tenant.slug}.smartchain.vn`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width="680px">
      <div className="flex max-h-[82vh] flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="border-b border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--sc-primary-lighter)] text-base font-semibold text-[var(--sc-primary-dark)]">
                {tenant.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="m-0 text-lg font-medium leading-6 text-[var(--sc-text-primary)]">
                    {tenant.name}
                  </h2>
                  <Badge
                    status={isSuspended ? 'error' : 'success'}
                    label={isSuspended ? t('status_suspended') : t('status_active')}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--sc-text-secondary)]">
                  <button
                    type="button"
                    onClick={() => handleCopy(tenant.slug, 'slug')}
                    className="inline-flex items-center gap-1 rounded border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sc-text-secondary)] transition-colors hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary)]"
                  >
                    <span>{tenant.slug}</span>
                    {copiedKey === 'slug' ? (
                      <Check size={11} className="text-[var(--sc-success)]" />
                    ) : (
                      <Copy size={11} className="opacity-50" />
                    )}
                  </button>
                  <span>•</span>
                  <a
                    href={`https://${domainUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--sc-primary)] hover:underline"
                  >
                    <Globe size={11} />
                    {domainUrl}
                    <ExternalLink size={9} />
                  </a>
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant={isSuspended ? 'primary' : 'danger'}
              onClick={() => {
                onClose();
                onToggleStatusClick();
              }}
            >
              {isSuspended ? (
                <>
                  <ShieldCheck size={14} className="mr-1.5" />
                  {t('activate_btn')}
                </>
              ) : (
                <>
                  <ShieldAlert size={14} className="mr-1.5" />
                  {t('suspend_btn')}
                </>
              )}
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-5">
            <Tabs
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as DetailTab)}
              tabs={[
                { id: 'overview', label: 'Tổng quan' },
                { id: 'metrics', label: 'Chỉ số & Quota' },
                { id: 'audit', label: 'Trạng thái & Lịch sử' },
              ]}
            />
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Suspended Alert */}
              {isSuspended && tenant.suspension && (
                <Alert variant="error" title={t('suspension_banner_title')}>
                  <div className="mt-1 space-y-1 text-xs">
                    <p className="m-0">
                      {t('reason')}: <strong>{tenant.suspension.reason}</strong>
                    </p>
                    <p className="m-0 text-[11px]">
                      Thực hiện bởi: {tenant.suspension.suspendedBy} lúc{' '}
                      {new Date(tenant.suspension.suspendedAt).toLocaleString('vi-VN')}
                    </p>
                    {tenant.suspension.internalNote && (
                      <p className="m-0 font-mono text-[11px]">
                        Ghi chú: {tenant.suspension.internalNote}
                      </p>
                    )}
                  </div>
                </Alert>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <Mail size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--sc-text-tertiary)]">{t('admin_email')}</div>
                    <div className="mt-0.5 truncate font-medium text-[var(--sc-text-primary)]">
                      {tenant.adminEmail || t('not_provided')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <Phone size={16} />
                  </span>
                  <div>
                    <div className="text-xs text-[var(--sc-text-tertiary)]">{t('phone')}</div>
                    <div className="mt-0.5 font-medium text-[var(--sc-text-primary)]">
                      {tenant.phone || t('not_provided')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <Receipt size={16} />
                  </span>
                  <div>
                    <div className="text-xs text-[var(--sc-text-tertiary)]">{t('tax_id')}</div>
                    <div className="mt-0.5 font-mono font-medium text-[var(--sc-text-primary)]">
                      {tenant.taxId || t('not_provided')}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sc-primary-lighter)] text-[var(--sc-primary-dark)]">
                    <CreditCard size={16} />
                  </span>
                  <div>
                    <div className="text-xs text-[var(--sc-text-tertiary)]">{t('created_at')}</div>
                    <div className="mt-0.5 font-medium text-[var(--sc-text-primary)]">
                      {new Date(tenant.createdAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Summary */}
              <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-[var(--sc-text-primary)]">
                    Gói dịch vụ đăng ký
                  </div>
                  <Badge
                    status={
                      tenant.subscription?.planCode === 'ENTERPRISE'
                        ? 'info'
                        : tenant.subscription?.planCode === 'PRO'
                        ? 'success'
                        : 'default'
                    }
                    label={tenant.subscription?.planCode || 'STANDARD'}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--sc-text-secondary)]">
                  <div>
                    <span>Ngày bắt đầu: </span>
                    <strong className="text-[var(--sc-text-primary)]">
                      {tenant.subscription?.startDate
                        ? new Date(tenant.subscription.startDate).toLocaleDateString('vi-VN')
                        : 'Theo kỳ kích hoạt'}
                    </strong>
                  </div>
                  <div>
                    <span>Kỳ hạn gia hạn: </span>
                    <strong className="text-[var(--sc-text-primary)]">
                      {tenant.subscription?.endDate
                        ? new Date(tenant.subscription.endDate).toLocaleDateString('vi-VN')
                        : 'Tự động gia hạn'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: METRICS & QUOTA */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              {/* Aggregates row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 text-center">
                  <Warehouse className="mx-auto mb-1.5 text-[var(--sc-primary)]" size={20} />
                  <div className="text-2xl font-semibold text-[var(--sc-text-primary)]">
                    {warehouseCount}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--sc-text-tertiary)]">{t('warehouses')}</div>
                </div>

                <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 text-center">
                  <Activity className="mx-auto mb-1.5 text-[var(--sc-primary)]" size={20} />
                  <div className="text-2xl font-semibold text-[var(--sc-text-primary)]">
                    {orderCount.toLocaleString()}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--sc-text-tertiary)]">{t('monthly_orders')}</div>
                </div>

                <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4 text-center">
                  <Truck className="mx-auto mb-1.5 text-[var(--sc-primary)]" size={20} />
                  <div className="text-2xl font-semibold text-[var(--sc-text-primary)]">
                    {carrierCount}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--sc-text-tertiary)]">{t('connected_carriers')}</div>
                </div>
              </div>

              {/* Resource Quota Usage Bars */}
              <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-4">
                <div className="text-xs font-medium text-[var(--sc-text-secondary)]">
                  Mức tiêu thụ hạn mức định mức tháng
                </div>

                <div className="mt-4 space-y-4">
                  {/* Orders bar */}
                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[var(--sc-text-primary)]">{t('orders_quota')}</span>
                      <span className="text-[var(--sc-text-tertiary)]">
                        <strong className="text-[var(--sc-text-primary)]">
                          {tenant.quota.ordersUsed.toLocaleString()}
                        </strong>{' '}
                        / {tenant.quota.ordersTotal.toLocaleString()} ({ordersPercentage}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--sc-bg-muted)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          ordersPercentage > 90 ? 'bg-[var(--sc-error)]' : 'bg-[var(--sc-primary)]'
                        }`}
                        style={{ width: `${ordersPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* API Calls bar */}
                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-[var(--sc-text-primary)]">{t('api_calls_quota')}</span>
                      <span className="text-[var(--sc-text-tertiary)]">
                        <strong className="text-[var(--sc-text-primary)]">
                          {tenant.quota.apiCallsUsed.toLocaleString()}
                        </strong>{' '}
                        / {tenant.quota.apiCallsTotal.toLocaleString()} ({apiCallsPercentage}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--sc-bg-muted)]">
                      <div
                        className="h-full rounded-full bg-[var(--sc-primary)] transition-all duration-500"
                        style={{ width: `${apiCallsPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT & HISTORY */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              {tenant.suspension ? (
                <div className="rounded-xl border border-[var(--sc-error-border)] bg-[var(--sc-error-bg)] p-4 text-xs text-[var(--sc-error-dark)]">
                  <div className="font-medium">Nhật ký Tạm dừng hoạt động</div>
                  <div className="mt-2 space-y-1">
                    <div>Lý do: <strong>{tenant.suspension.reason}</strong></div>
                    <div>Người thực hiện: {tenant.suspension.suspendedBy}</div>
                    <div>Thời điểm: {new Date(tenant.suspension.suspendedAt).toLocaleString('vi-VN')}</div>
                    {tenant.suspension.internalNote && (
                      <div className="mt-2 rounded bg-[var(--sc-bg-surface)] p-2 font-mono text-[11px]">
                        Ghi chú nội bộ: {tenant.suspension.internalNote}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--sc-success-border)] bg-[var(--sc-success-bg)] p-4 text-xs text-[var(--sc-success-dark)]">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} />
                    Không có vi phạm hoặc lệnh tạm dừng nào đang áp dụng.
                  </div>
                </div>
              )}

              {tenant.restoration && (
                <div className="rounded-xl border border-[var(--sc-info-border)] bg-[var(--sc-info-bg)] p-4 text-xs text-[var(--sc-info-dark)]">
                  <div className="font-medium">Lịch sử Kích hoạt lại gần nhất</div>
                  <div className="mt-2 space-y-1">
                    <div>Giải trình: {tenant.restoration.reason}</div>
                    <div>Người mở khóa: {tenant.restoration.unsuspendedBy}</div>
                    <div>Thời điểm: {new Date(tenant.restoration.unsuspendedAt).toLocaleString('vi-VN')}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
