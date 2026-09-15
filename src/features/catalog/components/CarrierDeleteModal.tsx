import { useState } from 'react';

import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import type { CarrierCredential } from '../types/carrierCredential.types';

interface CarrierDeleteModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly credential: CarrierCredential | null;
  readonly onDelete: (id: string) => Promise<boolean>;
}

export function CarrierDeleteModal({
  isOpen,
  onClose,
  credential,
  onDelete,
}: CarrierDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!credential) return null;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(credential.id);
      toast.success(
        `Đã gỡ kết nối hãng ${credential.carrier.name} (${credential.name}) thành công.`,
      );
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể gỡ kết nối. Vui lòng thử lại sau.';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Xác nhận gỡ kết nối hãng vận chuyển"
      width="500px"
    >
      <div className="space-y-5 p-6">
        {/* Warning callout */}
        <div className="flex items-start gap-3.5 rounded-xl border border-[var(--sc-error-border,#fecaca)] bg-[var(--sc-error-bg,#fef2f2)] p-4 text-sm text-[var(--sc-error-text,#991b1b)]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-[var(--sc-error)]">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-base text-[var(--sc-text-primary)]">
              Gỡ kết nối {credential.carrier.name}?
            </p>
            <p className="text-xs text-[var(--sc-text-secondary)] leading-relaxed">
              Cấu hình đang chọn: <span className="font-semibold text-[var(--sc-text-primary)]">{credential.name}</span>{' '}
              <span className="inline-block rounded-full bg-[var(--sc-bg-surface)] px-2 py-0.5 text-[10px] font-mono font-medium border border-[var(--sc-border-default)]">
                {credential.environment}
              </span>
            </p>
          </div>
        </div>

        {/* Data safety reassurance */}
        <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-4 text-xs">
          <p className="font-semibold text-[var(--sc-text-primary)] flex items-center gap-1.5">
            <span>🛡️</span> Bảo toàn dữ liệu & Lịch sử vận đơn
          </p>
          <p className="mt-1.5 text-[var(--sc-text-secondary)] leading-relaxed">
            Hệ thống sẽ ngừng sử dụng kết nối này để tạo vận đơn mới. Toàn bộ lịch sử vận đơn, 
            dữ liệu đối soát cước COD và báo cáo hiệu suất đã phát sinh trước đây sẽ được{' '}
            <strong className="text-[var(--sc-text-primary)]">lưu trữ an toàn 100%</strong>.
          </p>
        </div>

        {/* Modal actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4"
          >
            Hủy bỏ
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="px-5 shadow-sm"
          >
            {isDeleting ? 'Đang gỡ...' : 'Xác nhận gỡ kết nối'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
