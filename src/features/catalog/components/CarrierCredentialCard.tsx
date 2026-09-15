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

import { Button, Card } from '@/components/Common';

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
      toast.success('Đã sao chép khóa API vào bộ nhớ tạm');
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const renderStatusBadge = () => {
    switch (credential.status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đã kết nối</span>
            {lastPingResult?.latencyMs ? (
              <span className="font-mono text-[11px] text-emerald-600 opacity-90">
                · {lastPingResult.latencyMs}ms
              </span>
            ) : null}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span>Lỗi kết nối</span>
          </span>
        );
      case 'UNVERIFIED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>Chưa kiểm tra</span>
          </span>
        );
    }
  };

  const renderEnvironmentBadge = () => {
    const isProd = credential.environment === 'PRODUCTION';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
          isProd
            ? 'border border-teal-200 bg-teal-50 text-[var(--sc-primary)]'
            : 'border border-slate-200 bg-slate-100 text-slate-600'
        }`}
      >
        <Globe size={11} className="opacity-75" />
        {credential.environment}
      </span>
    );
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Chưa kiểm tra';
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
    <Card className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--sc-primary-light)] hover:shadow-md">
      <div className="p-5">
        {/* Header: Logo, Tên hãng, Môi trường & Trạng thái */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-2 shadow-2xs">
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
                <span className="rounded-md bg-[var(--sc-bg-secondary)] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--sc-text-secondary)] border border-[var(--sc-border-default)]">
                  {credential.carrier.code}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-[var(--sc-text-secondary)]">
                {credential.name}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {renderEnvironmentBadge()}
            {renderStatusBadge()}
          </div>
        </div>

        {/* Thông tin Key & Chi tiết Ping */}
        <div className="mt-4 space-y-2.5 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5 text-xs">
          {/* Masked Preview Key */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--sc-text-secondary)]">API Key:</span>
            <div className="flex items-center gap-1.5">
              <code className="rounded-md bg-[var(--sc-bg-surface)] px-2 py-0.5 font-mono text-[12px] font-medium text-[var(--sc-text-primary)] border border-[var(--sc-border-default)] shadow-2xs">
                {credential.maskedPreview}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="cursor-pointer rounded-md p-1.5 text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-surface)] hover:text-[var(--sc-text-primary)]"
                title="Sao chép khóa API"
                aria-label="Sao chép khóa API"
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
            <span className="flex items-center gap-1 text-[11px]">
              <Clock size={12} className="opacity-70" /> Lần kiểm tra:
            </span>
            <span className="font-mono text-[11px] font-medium text-[var(--sc-text-primary)]">
              {formatDateTime(credential.lastPingAt)}
            </span>
          </div>

          {/* Thông điệp Ping */}
          {credential.lastPingMessage && (
            <div
              className={`flex items-start gap-2 rounded-lg p-2.5 text-xs leading-relaxed ${
                credential.status === 'CONNECTED'
                  ? 'border border-emerald-200/80 bg-emerald-50/80 text-emerald-800'
                  : 'border border-red-200/80 bg-red-50/80 text-red-800'
              }`}
            >
              {credential.status === 'CONNECTED' ? (
                <CheckCircle2
                  size={14}
                  className="shrink-0 mt-0.5 text-emerald-600"
                />
              ) : (
                <XCircle
                  size={14}
                  className="shrink-0 mt-0.5 text-red-600"
                />
              )}
              <span className="break-words font-medium">{credential.lastPingMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Action Buttons */}
      <div className="flex items-center justify-between border-t border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] px-5 py-3.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onTestPing(credential.id)}
          disabled={isPinging || !canManage}
          className="gap-1.5 text-xs font-medium transition-all hover:border-[var(--sc-primary)] hover:text-[var(--sc-primary)]"
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

        {canManage ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(credential)}
              className="cursor-pointer rounded-lg p-1.5 text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-bg-secondary)] hover:text-[var(--sc-text-primary)]"
              aria-label="Chỉnh sửa cấu hình"
              title="Chỉnh sửa cấu hình"
            >
              <Edit2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(credential)}
              className="cursor-pointer rounded-lg p-1.5 text-[var(--sc-text-secondary)] transition-colors hover:bg-[var(--sc-error-bg,#fef2f2)] hover:text-[var(--sc-error)]"
              aria-label="Gỡ kết nối"
              title="Gỡ kết nối hãng"
            >
              <Trash2 size={15} />
            </button>
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
