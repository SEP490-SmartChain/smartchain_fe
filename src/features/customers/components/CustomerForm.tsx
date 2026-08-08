import React from 'react';

import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { toast } from 'sonner';

import {
  customerSchema,
  type CustomerFormValues,
} from '@/features/customers/schemas/customerSchema';
import { cn } from '@/lib/utils';

interface CustomerFormProps {
  onClose: () => void;
  onSubmitSuccess?: () => void;
}

export default function CustomerForm({ onClose, onSubmitSuccess }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      status: 'Approved',
    },
  });

  const onSubmit = async (_data: CustomerFormValues) => {
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // console.log('Form submitted successfully:', data);
      toast.success('Customer added successfully!');
      if (onSubmitSuccess) onSubmitSuccess();
      onClose();
    } catch (_error) {
      toast.error('Failed to add customer');
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black/40 flex items-center justify-center z-[100] backdrop-blur-[2px]">
      <div className="bg-white w-full max-w-[500px] rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden">
        <div className="flex justify-between items-center py-5 px-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 m-0">New Customer</h2>
          <button
            className="bg-transparent border-none text-gray-400 cursor-pointer p-1 rounded transition-colors hover:bg-gray-100 hover:text-gray-600 flex"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[13px] font-medium text-gray-700">Full Name *</label>
            <input
              {...register('name')}
              className={cn(
                'px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
                errors.name && 'border-red-500 focus:border-red-500',
              )}
              placeholder="e.g. John Doe"
            />
            {errors.name && <span className="text-red-500 text-xs">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[13px] font-medium text-gray-700">Email Address *</label>
            <input
              {...register('email')}
              className={cn(
                'px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
                errors.email && 'border-red-500 focus:border-red-500',
              )}
              placeholder="e.g. john@example.com"
            />
            {errors.email && <span className="text-red-500 text-xs">{errors.email.message}</span>}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[13px] font-medium text-gray-700">Date of Birth *</label>
              <input
                {...register('dob')}
                className={cn(
                  'px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
                  errors.dob && 'border-red-500 focus:border-red-500',
                )}
                placeholder="MM/DD/YYYY"
              />
              {errors.dob && <span className="text-red-500 text-xs">{errors.dob.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[13px] font-medium text-gray-700">Status</label>
              <select
                {...register('status')}
                className="px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)] bg-white"
              >
                <option value="Approved">Approved</option>
                <option value="Blocked">Blocked</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2 pt-6 border-t border-gray-200">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium cursor-pointer transition-colors hover:not(:disabled):bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 border-none bg-blue-500 text-white rounded-md text-sm font-medium cursor-pointer transition-colors hover:not(:disabled):bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
