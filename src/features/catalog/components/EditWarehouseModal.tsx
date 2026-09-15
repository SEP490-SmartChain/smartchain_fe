import { useEffect, useState } from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Building, Phone, User, Mail, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';
import Modal from '@/components/Common/Modal/Modal';

import { warehouseApi } from '../api/warehouseApi';

import type { Warehouse } from '../types/warehouse';

const editWarehouseSchema = z.object({
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

type FormValues = z.infer<typeof editWarehouseSchema>;

interface Props {
  warehouse: Warehouse | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditWarehouseModal({ warehouse, onClose, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(editWarehouseSchema),
  });

  useEffect(() => {
    if (warehouse) {
      reset({
        name: warehouse.name,
        address: warehouse.address,
        provinceCode: warehouse.provinceCode,
        districtCode: warehouse.districtCode,
        wardCode: warehouse.wardCode,
        latitude: warehouse.latitude,
        longitude: warehouse.longitude,
        dailyCapacity: warehouse.dailyCapacity,
        contactName: warehouse.contactName || '',
        contactPhone: warehouse.contactPhone || '',
        contactEmail: warehouse.contactEmail || '',
      });
    }
  }, [warehouse, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!warehouse) return;
    setIsSubmitting(true);
    try {
      await warehouseApi.update(warehouse.id, {
        ...values,
        contactName: values.contactName || null,
        contactPhone: values.contactPhone || null,
        contactEmail: values.contactEmail || null,
      });
      toast.success('Cập nhật kho hàng thành công!');
      reset();
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Có lỗi xảy ra khi cập nhật kho');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!warehouse) return null;

  return (
    <Modal isOpen={!!warehouse} onClose={handleClose} title="Cập nhật kho hàng">
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-5">
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
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã tỉnh/thành
            </label>
            <Input {...register('provinceCode')} error={errors.provinceCode?.message} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã quận/huyện
            </label>
            <Input {...register('districtCode')} error={errors.districtCode?.message} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Mã phường/xã
            </label>
            <Input {...register('wardCode')} error={errors.wardCode?.message} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Latitude
            </label>
            <Input
              type="number"
              step="any"
              {...register('latitude', { valueAsNumber: true })}
              error={errors.latitude?.message}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Longitude
            </label>
            <Input
              type="number"
              step="any"
              {...register('longitude', { valueAsNumber: true })}
              error={errors.longitude?.message}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Công suất
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
                placeholder="Đại diện"
                className="pl-9"
                error={errors.contactName?.message}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              SĐT liên hệ
            </label>
            <div className="relative">
              <Phone
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('contactPhone')}
                placeholder="SĐT"
                className="pl-9"
                error={errors.contactPhone?.message}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--sc-text-primary)]">
              Email liên hệ
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-text-tertiary)]"
              />
              <Input
                {...register('contactEmail')}
                placeholder="Email"
                className="pl-9"
                error={errors.contactEmail?.message}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3 border-t border-[var(--sc-border-default)] pt-5">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Modal>
  );
}
