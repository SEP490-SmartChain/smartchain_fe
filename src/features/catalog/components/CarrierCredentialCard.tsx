import { useState } from 'react';

import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  Globe,
  Loader2,
  RotateCw,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Button, Card } from '@/components/Common';

import type {
  CarrierCredential,
  PingTestResult,
} from '../types/carrierCredential.types';

interface CarrierCredentialCardProps {
  readonly credential: CarrierCredential;
  readonly isPinging: boolean;
  readonly lastPingResult?: PingTestResult;
  readonly canManage: boolean;
  readonly onTestPing: (id: string) => Promise<PingTestResult | null>;
  readonly onEdit: (credential: CarrierCredential) => void;
  readonly onDelete: (credential: CarrierCredential) => void;
}

export function CarrierCredentialCard({
  credential,
  isPinging,
  lastPingResult,
  canManage,
  onTestPing,
  onEdit,
  onDelete,
}: CarrierCredentialCardProps) {
  const [hasCopied, setHasCopied] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credential.maskedPreview);
      setHasCopied(true);
      toast.success('Đã sao chép chuỗi mã hóa vào bộ nhớ tạm');
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const statusBadge = () => {
    switch (credential.status) {
      case 'CONNECTED':
        return (
          <div className="flex items-center gap-1.5">
            <Badge status="success" label="Đã kết nối" />
            {lastPingResult?.latencyMs ? (
              <span className="rounded bg-[var(--sc-success-bg)] px-1.5 py-0.5 text-[11px] font-mono font-medium text-[var(--sc-success-dark)]">
                {lastPingResult.latencyMs}ms
              </span>
            ) : null}
          </div>
        );
      case 'FAILED':
        return <Badge status="error" label="Lỗi kết nối" />;
      case 'UNVERIFIED':
      default:
        return <Badge status="warning" label="Chưa kiểm tra" />;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Chưa từng kiểm tra';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="flex flex-col justify-between overflow-hidden border border-[var(--sc-border-default)] transition-all duration-150 hover:border-[var(--sc-primary-light)] hover:shadow-sm">
      <div className="p-5">
        {/* Header: Logo, Tên hãng, Môi trường */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-2">
              {credential.carrier.logoUrl && !logoError ? (
                <img
                  src={credential.carrier.logoUrl}
                  alt={credential.carrier.name}
                  className="h-full w-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Truck className="h-6 w-6 text-[var(--sc-primary)]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--sc-text-primary)]">
                  {credential.carrier.name}
                </h3>
                <span className="rounded bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 text-[11px] font-mono font-medium text-[var(--sc-text-secondary)]">
                  {credential.carrier.code}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--sc-text-secondary)]">
                {credential.name}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                credential.environment === 'PRODUCTION'
                  ? 'border border-[var(--sc-primary-light)] bg-[var(--sc-primary-subtle,#e0f2fe)] text-[var(--sc-primary)]'
                  : 'border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] text-[var(--sc-text-secondary)]'
              }`}
            >
              {credential.environment}
            </span>
            {statusBadge()}
          </div>
        </div>

        {/* Thông tin Key & Chi tiết Ping */}
        <div className="mt-4 space-y-2.5 rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-xs">
          {/* Masked Preview Key */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--sc-text-secondary)]">API Key:</span>
            <div className="flex items-center gap-1.5">
              <code className="rounded bg-[var(--sc-bg-surface)] px-2 py-0.5 font-mono text-[12px] font-medium text-[var(--sc-text-primary)] border border-[var(--sc-border-default)]">
                {credential.maskedPreview}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="cursor-pointer rounded p-1 text-[var(--sc-text-secondary)] hover:bg-[var(--sc-bg-surface)] hover:text-[var(--sc-text-primary)]"
                title="Sao chép chuỗi mã hóa"
                aria-label="Sao chép chuỗi mã hóa"
              >
                {hasCopied ? (
                  <Check size={14} className="text-[var(--sc-success)]" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>

          {/* Lần Ping gần nhất */}
          <div className="flex items-center justify-between border-t border-[var(--sc-border-default)] pt-2 text-[var(--sc-text-secondary)]">
            <span className="flex items-center gap-1">
              <Clock size={12} /> Lần kiểm tra:
            </span>
            <span>{formatDateTime(credential.lastPingAt)}</span>
          </div>

          {/* Thông điệp Ping */}
          {credential.lastPingMessage && (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--sc-text-secondary)]">
              {credential.status === 'CONNECTED' ? (
                <CheckCircle2
                  size={13}
                  className="shrink-0 mt-0.5 text-[var(--sc-success)]"
                />
              ) : (
                <XCircle
                  size={13}
                  className="shrink-0 mt-0.5 text-[var(--sc-error)]"
                />
              )}
              <span className="truncate">{credential.lastPingMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Action Buttons */}
      <div className="flex items-center justify-between border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-5 py-3">
        {/* Nút Ping Test (Task 1-19) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onTestPing(credential.id)}
          disabled={isPinging || !canManage}
          className="gap-1.5 text-xs"
        >
          {isPinging ? (
            <>
              <Loader2 size={13} className="animate-spin text-[var(--sc-primary)]" />
              <span>Đang kiểm tra...</span>
            </>
          ) : (
            <>
              <RotateCw size={13} />
              <span>Kiểm tra kết nối</span>
            </>
          )}
        </Button>

        {/* Nút Sửa (Task 1-17) & Gỡ kết nối (Task 1-18) */}
        {canManage ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(credential)}
              className="h-8 w-8 p-0 text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]"
              aria-label="Chỉnh sửa cấu hình"
              title="Chỉnh sửa cấu hình"
            >
              <Edit2 size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(credential)}
              className="h-8 w-8 p-0 text-[var(--sc-error)] hover:bg-[var(--sc-error-bg,#fef2f2)] hover:text-[var(--sc-error-dark)]"
              aria-label="Gỡ kết nối"
              title="Gỡ kết nối hãng"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--sc-text-tertiary)]">
            Chỉ xem (View-only)
          </span>
        )}
      </div>
    </Card>
  );
}
