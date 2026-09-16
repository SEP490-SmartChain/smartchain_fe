import { useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Building, Phone, User, Mail, Hash, Activity } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';
import { toast } from 'sonner';

import { warehouseApi } from '../api/warehouseApi';

const createWarehouseSchema = z.object({
  code: z.string().min(1, 'Mã kho không được để trống'),
  name: z.string().min(3, 'Tên kho từ 3-150 kí tự').max(150),
  address: z.string().min(5, 'Địa chỉ từ 5-255 kí tự').max(255),
  provinceCode: z.string().min(1, 'Vui lòng chọn Tỉnh/Thành'),
  districtCode: z.string().min(1, 'Vui lòng chọn Quận/Huyện'),
  wardCode: z.string().min(1, 'Vui lòng chọn Phường/Xã'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  dailyCapacity: z.number().int().min(1).max(1000000),
  contactName: z.string().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(20).optional().or(z.literal('')),
  contactEmail: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof createWarehouseSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddWarehouseModal({ isOpen, onClose, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createWarehouseSchema),
    defaultValues: {
      dailyCapacity: 100,
      latitude: 10.762622,
      longitude: 106.660172,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await warehouseApi.create({
        ...values,
        contactName: values.contactName || null,
        contactPhone: values.contactPhone || null,
        contactEmail: values.contactEmail || null,
      });
      toast.success('Thêm kho hàng thành công!');
      reset();
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Có lỗi xảy ra khi tạo kho');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Thêm kho hàng mới">
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã kho <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Hash
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('code')}
                placeholder="VD: WH-HCM-01"
                className="pl-9"
                error={errors.code?.message}
              />
            </div>
            {errors.code && <p className="mt-1.5 text-xs text-red-500">{errors.code.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Tên kho <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('name')}
                placeholder="Tên kho hàng"
                className="pl-9"
                error={errors.name?.message}
              />
            </div>
            {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
            Địa chỉ <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <MapPin
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
            />
            <Input
              {...register('address')}
              placeholder="Địa chỉ chi tiết"
              className="pl-9"
              error={errors.address?.message}
            />
          </div>
          {errors.address && (
            <p className="mt-1.5 text-xs text-red-500">{errors.address.message}</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã tỉnh/thành <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('provinceCode')}
              placeholder="VD: 79"
              error={errors.provinceCode?.message}
            />
            {errors.provinceCode && (
              <p className="mt-1.5 text-xs text-red-500">{errors.provinceCode.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã quận/huyện <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('districtCode')}
              placeholder="VD: 760"
              error={errors.districtCode?.message}
            />
            {errors.districtCode && (
              <p className="mt-1.5 text-xs text-red-500">{errors.districtCode.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã phường/xã <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('wardCode')}
              placeholder="VD: 26734"
              error={errors.wardCode?.message}
            />
            {errors.wardCode && (
              <p className="mt-1.5 text-xs text-red-500">{errors.wardCode.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Latitude <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              step="any"
              {...register('latitude', { valueAsNumber: true })}
              error={errors.latitude?.message}
            />
            {errors.latitude && (
              <p className="mt-1.5 text-xs text-red-500">{errors.latitude.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Longitude <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              step="any"
              {...register('longitude', { valueAsNumber: true })}
              error={errors.longitude?.message}
            />
            {errors.longitude && (
              <p className="mt-1.5 text-xs text-red-500">{errors.longitude.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Công suất/Ngày <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Activity
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                type="number"
                {...register('dailyCapacity', { valueAsNumber: true })}
                className="pl-9"
                error={errors.dailyCapacity?.message}
              />
            </div>
            {errors.dailyCapacity && (
              <p className="mt-1.5 text-xs text-red-500">{errors.dailyCapacity.message}</p>
            )}
          </div>
        </div>

        <hr className="my-2 border-[var(--sc-border-default)]" />

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Người liên hệ
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('contactName')}
                placeholder="Tên người đại diện"
                className="pl-9"
                error={errors.contactName?.message}
              />
            </div>
            {errors.contactName && (
              <p className="mt-1.5 text-xs text-red-500">{errors.contactName.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Số điện thoại
            </label>
            <div className="relative">
              <Phone
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('contactPhone')}
                placeholder="SĐT liên hệ"
                className="pl-9"
                error={errors.contactPhone?.message}
              />
            </div>
            {errors.contactPhone && (
              <p className="mt-1.5 text-xs text-red-500">{errors.contactPhone.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Email
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('contactEmail')}
                placeholder="Email liên hệ"
                className="pl-9"
                error={errors.contactEmail?.message}
              />
            </div>
            {errors.contactEmail && (
              <p className="mt-1.5 text-xs text-red-500">{errors.contactEmail.message}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Tạo kho hàng
          </Button>
        </div>
      </form>
    </Modal>
  );
}
