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
      title="Xác nhận gỡ kết nối Hãng vận chuyển"
      width="480px"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--sc-error-border,#fecaca)] bg-[var(--sc-error-bg,#fef2f2)] p-3 text-sm text-[var(--sc-error-text,#991b1b)]">
          <AlertTriangle size={20} className="shrink-0 mt-0.5 text-[var(--sc-error)]" />
          <div className="space-y-1">
            <p className="font-medium">
              Bạn có chắc chắn muốn gỡ kết nối hãng{' '}
              <strong>{credential.carrier.name}</strong>?
            </p>
            <p className="text-xs text-[var(--sc-text-secondary)]">
              Cấu hình: <span className="font-semibold">{credential.name}</span>{' '}
              ({credential.environment})
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3 text-xs text-[var(--sc-text-secondary)]">
          <p className="font-semibold text-[var(--sc-text-primary)]">
            🛡️ Cơ chế Xóa mềm bảo toàn dữ liệu (Task 1-18):
          </p>
          <p className="mt-1">
            Hệ thống chỉ đánh dấu gỡ liên kết. Toàn bộ lịch sử vận đơn cũ, dữ liệu
            đối soát cước COD và báo cáo hiệu suất trước đây liên quan đến cấu
            hình này sẽ được <strong>bảo toàn 100%</strong>.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            Hủy bỏ
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Đang gỡ...' : 'Xác nhận gỡ kết nối'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
