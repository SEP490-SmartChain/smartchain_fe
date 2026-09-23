import { useState, type FC } from 'react';

import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  KeyRound,
  Loader2,
  RotateCw,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/Common';

import type { CarrierCredential, PingTestResult } from '../types/carrierCredential.types';

interface CarrierCredentialCardProps {
  readonly credential: CarrierCredential;
  readonly isPinging: boolean;
  readonly lastPingResult?: PingTestResult;
  readonly canManage: boolean;
  readonly onTestPing: (id: string) => Promise<PingTestResult | null>;
  readonly onEdit: (credential: CarrierCredential) => void;
  readonly onDelete: (credential: CarrierCredential) => void;
}

export const CarrierCredentialCard: FC<CarrierCredentialCardProps> = ({
  credential,
  isPinging,
  lastPingResult,
  canManage,
  onTestPing,
  onEdit,
  onDelete,
}) => {
  const t = useTranslations('CarrierCredentials');
  const locale = useLocale();
  const [hasCopied, setHasCopied] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credential.maskedPreview);
      setHasCopied(true);
      toast.success(t('card.copySuccess'));
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error(t('card.copyError'));
    }
  };

  const isConnected = credential.status === 'CONNECTED';
  const isFailed = credential.status === 'FAILED';

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return t('card.neverTested');
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const currentLatency = lastPingResult?.latencyMs;

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-surface)] p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--sc-primary-light)] hover:shadow-md">
      {/* Top Accent Line theo trạng thái */}
      <div
        className={`absolute top-0 inset-x-0 h-1 transition-colors ${
          isConnected ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-400'
        }`}
      />

      <div className="space-y-4 pt-1">
        {/* HÀNG 1: Logo Hãng (Lấy từ upload của Super Admin, fallback icon xe tải chuẩn) + Environment & Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Khung Logo hãng chuẩn */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--sc-border-default)] bg-slate-50 p-1.5 shadow-2xs">
              {credential.carrier.logoUrl && !logoError ? (
                <img
                  src={credential.carrier.logoUrl}
                  alt={credential.carrier.name}
                  className="h-full w-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Truck className="h-5 w-5 text-[var(--sc-primary)]" />
              )}
            </div>

            {/* Code Badge & Auth Type */}
            <div className="flex flex-col">
              <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                {credential.carrier.code}
              </span>
              <span className="mt-0.5 text-[10px] font-medium tracking-wide text-[var(--sc-text-tertiary)] uppercase">
                {credential.authType}
              </span>
            </div>
          </div>

          {/* Edit/Delete Icons */}
          <div className="flex items-center gap-1.5">
            {canManage && (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onEdit(credential)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={t('card.edit')}
                  aria-label={t('card.edit')}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(credential)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  title={t('card.delete')}
                  aria-label={t('card.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* HÀNG 2: Tên Hãng Vận Chuyển Duy Nhất & Toàn Chiều Rộng (Đã bỏ dòng subtext lặp thừa) */}
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold tracking-tight text-[var(--sc-text-primary)] leading-snug">
            {credential.carrier.name}
          </h3>
        </div>

        {/* HÀNG 3: Thanh Trạng Thái Kết Nối & Live Latency Indicator */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50/80 p-2.5 ring-1 ring-slate-100 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {isConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="font-semibold text-emerald-700 whitespace-nowrap">
                  {t('status.connected')}
                </span>
              </>
            ) : isFailed ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                <span className="font-semibold text-red-700 whitespace-nowrap">
                  {t('status.failed')}
                </span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-semibold text-amber-700 whitespace-nowrap">
                  {t('status.unverified')}
                </span>
              </>
            )}
          </div>

          {/* Latency badge nếu có */}
          {currentLatency ? (
            <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full whitespace-nowrap border border-emerald-200">
              {currentLatency}ms
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock size={11} />
              {formatDateTime(credential.lastPingAt)}
            </span>
          )}
        </div>

        {/* HÀNG 4: Khối API Key (Secure Credential Vault) */}
        <div className="space-y-2 rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-[var(--sc-text-secondary)] text-[11px]">
              <KeyRound size={12} className="text-slate-400" /> {t('card.apiKey')}
            </span>
            <div className="flex items-center gap-1.5">
              <code className="rounded-md bg-white px-2 py-0.5 font-mono text-[12px] font-semibold text-slate-800 border border-slate-200 shadow-2xs">
                {credential.maskedPreview}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-all hover:bg-white hover:text-slate-800 hover:shadow-2xs active:scale-95"
                title={t('card.copy')}
                aria-label={t('card.copy')}
              >
                {hasCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Thông điệp Ping gần nhất nếu có */}
          {credential.lastPingMessage && (
            <div
              className={`flex items-start gap-1.5 rounded-lg p-2 text-[11px] leading-relaxed border ${
                isConnected
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                  : 'border-red-200 bg-red-50/70 text-red-800'
              }`}
            >
              {isConnected ? (
                <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <XCircle size={13} className="shrink-0 mt-0.5 text-red-600" />
              )}
              <span className="break-words line-clamp-2">{credential.lastPingMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER: Nút Kiểm tra kết nối */}
      <div className="mt-4 pt-3 border-t border-[var(--sc-border-default)]">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onTestPing(credential.id)}
          disabled={isPinging || !canManage}
          className="w-full justify-center gap-2 rounded-xl text-xs font-semibold transition-all duration-200 hover:border-[var(--sc-primary)] hover:bg-[var(--sc-primary-alpha-08)] hover:text-[var(--sc-primary)] active:scale-[0.98]"
        >
          {isPinging ? (
            <>
              <Loader2 size={13} className="animate-spin text-[var(--sc-primary)]" />
              <span>{t('card.testing')}</span>
            </>
          ) : (
            <>
              <RotateCw size={13} />
              <span>{t('card.testConnection')}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
