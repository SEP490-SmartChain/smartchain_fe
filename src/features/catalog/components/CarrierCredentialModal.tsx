import React, { useEffect, useState } from 'react';

import { Eye, EyeOff, Key, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Input, Select } from '@/components/Common';
import Modal from '@/components/Common/Modal/Modal';

import type {
  CarrierCredential,
  CarrierSummary,
  CreateCarrierCredentialInput,
  DeploymentEnvironment,
  UpdateCarrierCredentialInput,
} from '../types/carrierCredential.types';

interface CarrierCredentialModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly editingCredential?: CarrierCredential | null;
  readonly availableCarriers: readonly CarrierSummary[];
  readonly onCreate: (
    payload: CreateCarrierCredentialInput,
  ) => Promise<CarrierCredential>;
  readonly onUpdate: (
    id: string,
    payload: UpdateCarrierCredentialInput,
  ) => Promise<CarrierCredential>;
}

export function CarrierCredentialModal({
  isOpen,
  onClose,
  editingCredential,
  availableCarriers,
  onCreate,
  onUpdate,
}: CarrierCredentialModalProps) {
  const isEditing = Boolean(editingCredential);

  const [carrierId, setCarrierId] = useState('');
  const [name, setName] = useState('');
  const [environment, setEnvironment] =
    useState<DeploymentEnvironment>('SANDBOX');
  const [apiToken, setApiToken] = useState('');
  const [shopId, setShopId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Khởi tạo state khi mở modal
  useEffect(() => {
    if (editingCredential) {
      setCarrierId(editingCredential.carrierId);
      setName(editingCredential.name);
      setEnvironment(editingCredential.environment);
      setApiToken('');
      setShopId('');
    } else {
      const defaultCarrier = availableCarriers[0];
      setCarrierId(defaultCarrier?.id ?? '');
      setName(defaultCarrier ? `${defaultCarrier.name} Kho Chính` : '');
      setEnvironment('PRODUCTION');
      setApiToken('');
      setShopId('');
    }
    setShowToken(false);
    setErrors({});
  }, [editingCredential, availableCarriers, isOpen]);

  const selectedCarrier = availableCarriers.find((c) => c.id === carrierId);
  const isGhn =
    selectedCarrier?.code === 'GHN' || editingCredential?.carrier.code === 'GHN';

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!isEditing && !carrierId) {
      nextErrors.carrierId = 'Vui lòng chọn hãng vận chuyển.';
    }

    if (!name.trim() || name.trim().length < 2) {
      nextErrors.name = 'Tên cấu hình tối thiểu 2 ký tự.';
    }

    if (!isEditing) {
      if (!apiToken.trim() || apiToken.trim().length < 4) {
        nextErrors.apiToken = 'API Token tối thiểu 4 ký tự.';
      }
    } else if (apiToken && apiToken.trim().length < 4) {
      nextErrors.apiToken = 'API Token mới tối thiểu 4 ký tự.';
    }

    if (isGhn && !isEditing && !shopId.trim()) {
      nextErrors.shopId = 'Mã Shop ID là bắt buộc đối với GHN.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      if (isEditing && editingCredential) {
        const updatePayload: UpdateCarrierCredentialInput = {
          name: name.trim(),
          environment,
          ...(apiToken.trim()
            ? {
                credentials: {
                  apiToken: apiToken.trim(),
                  ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
                },
              }
            : {}),
        };
        await onUpdate(editingCredential.id, updatePayload);
        toast.success(
          apiToken.trim()
            ? 'Cập nhật API Key thành công! Trạng thái đã reset về Chưa kiểm tra (UNVERIFIED).'
            : 'Cập nhật thông tin cấu hình thành công!',
        );
      } else {
        const createPayload: CreateCarrierCredentialInput = {
          carrierId,
          name: name.trim(),
          environment,
          authType: 'API_TOKEN',
          credentials: {
            apiToken: apiToken.trim(),
            ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
          },
        };
        await onCreate(createPayload);
        toast.success(
          'Kết nối hãng vận chuyển thành công! Key đã được mã hóa an toàn.',
        );
      }
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu cấu hình.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const carrierOptions = availableCarriers.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
  }));

  const environmentOptions = [
    { value: 'SANDBOX', label: 'SANDBOX (Môi trường thử nghiệm / Test Key)' },
    { value: 'PRODUCTION', label: 'PRODUCTION (Môi trường thực tế / Live Key)' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? `Cập nhật cấu hình: ${editingCredential?.carrier.name}`
          : 'Thêm mới kết nối Hãng Vận Chuyển (3PL)'
      }
      width="540px"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
        {/* Chọn Hãng */}
        <div>
          <Select
            label="Hãng vận chuyển"
            value={carrierId}
            onChange={(e) => {
              setCarrierId(e.target.value);
              const found = availableCarriers.find(
                (c) => c.id === e.target.value,
              );
              if (found) {
                setName(`${found.name} Kho Chính`);
              }
            }}
            options={carrierOptions}
            disabled={isEditing}
            error={errors.carrierId}
            required={!isEditing}
          />
        </div>

        {/* Tên cấu hình */}
        <div className="space-y-1.5">
          <Input
            label="Tên cấu hình phân biệt"
            placeholder="Ví dụ: GHN Kho Chính, GHN Chi nhánh HCM..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            required
          />
          <p className="text-[11px] text-[var(--sc-text-secondary)]">
            Tên gọi gợi nhớ giúp bạn phân biệt các tài khoản hoặc kho hàng khác nhau.
          </p>
        </div>

        {/* Môi trường */}
        <div className="space-y-1.5">
          <Select
            label="Môi trường hoạt động"
            value={environment}
            onChange={(e) =>
              setEnvironment(e.target.value as DeploymentEnvironment)
            }
            options={environmentOptions}
            required
          />
          <p className="text-[11px] text-[var(--sc-text-secondary)]">
            {environment === 'PRODUCTION' ? (
              <span className="text-[var(--sc-success-dark)]">
                ● <strong>PRODUCTION (Thực tế):</strong> Dùng cho tài khoản thật đang kinh doanh trên cổng chính thức của hãng.
              </span>
            ) : (
              <span className="text-[var(--sc-warning-dark)]">
                ● <strong>SANDBOX (Thử nghiệm):</strong> Chỉ dùng với API Token cấp riêng từ môi trường test dev của hãng.
              </span>
            )}
          </p>
        </div>

        {/* Thông tin API Token */}
        <div className="space-y-2">
          {isEditing && (
            <div className="rounded-xl border border-[var(--sc-border-default)] bg-[var(--sc-bg-secondary)] p-3.5 text-xs text-[var(--sc-text-secondary)]">
              <span className="font-semibold text-[var(--sc-text-primary)]">
                Key hiện tại:{' '}
              </span>
              <code className="rounded bg-[var(--sc-bg-surface)] px-1.5 py-0.5 font-mono text-[var(--sc-primary)] border border-[var(--sc-border-default)]">
                {editingCredential?.maskedPreview}
              </code>
              <p className="mt-1">
                Để trống ô bên dưới nếu bạn chỉ muốn đổi tên hoặc môi trường.
              </p>
            </div>
          )}

          <Input
            label={
              isEditing ? 'Nhập API Token mới (tùy chọn)' : 'API Token / Secret'
            }
            type={showToken ? 'text' : 'password'}
            placeholder={
              isEditing
                ? 'Nhập Token mới nếu muốn đổi Key...'
                : 'Dán Token/Key được cấp từ hãng...'
            }
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            error={errors.apiToken}
            required={!isEditing}
            leftIcon={<Key size={16} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="cursor-pointer p-1 text-[var(--sc-text-secondary)] hover:text-[var(--sc-text-primary)]"
                aria-label={showToken ? 'Ẩn token' : 'Hiện token'}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </div>

        {/* Shop ID nếu là GHN */}
        {isGhn && (
          <div className="space-y-1.5">
            <Input
              label="Shop ID (Bắt buộc với Giao Hàng Nhanh)"
              placeholder="Ví dụ: 5355714"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              error={errors.shopId}
              required={!isEditing}
            />
            <p className="text-[11px] text-[var(--sc-text-secondary)]">
              Mã Shop ID hiển thị cạnh số điện thoại tại góc trên bên trái trang quản lý GHN.
            </p>
          </div>
        )}

        {/* Cảnh báo khi sửa key */}
        {isEditing && apiToken.trim() && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--sc-warning-border,#fde68a)] bg-[var(--sc-warning-bg,#fef3c7)] p-3.5 text-xs text-[var(--sc-warning-text,#92400e)]">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Lưu ý bảo mật:</strong> Khi thay đổi API Token mới, trạng thái kết nối
              sẽ được chuyển về <strong>Chưa kiểm tra</strong> để đảm bảo an toàn. Bạn vui lòng bấm nút "Kiểm tra kết nối"
              sau khi lưu để kích hoạt lại vào thuật toán điều phối.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Đang lưu...'
              : isEditing
                ? 'Lưu thay đổi'
                : 'Lưu kết nối'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
