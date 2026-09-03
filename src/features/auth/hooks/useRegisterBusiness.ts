import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { apiClient } from '@/services/apiClient';
import type { RegisterFormData } from '../schemas/register.schema';

interface RegisterBusinessPayload {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  taxId?: string;
  password: string;
}

interface RegisterBusinessResponse {
  success: boolean;
  data: {
    tenantId: string;
    userId: string;
    tenantSlug: string;
  };
  meta: {
    timestamp: string;
    path: string;
    requestId: string;
  };
}

export function useRegisterBusiness() {
  const navigate = useNavigate();

  const register = async (formData: RegisterFormData) => {
    try {
      const payload: RegisterBusinessPayload = {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        companyName: formData.companyName,
        password: formData.password,
        ...(formData.taxId && formData.taxId.trim() !== '' ? { taxId: formData.taxId } : {}),
      };

      const response = await apiClient.post<RegisterBusinessResponse>(
        '/auth/register',
        payload,
        { requiresAuth: false },
      );

      if (response.success) {
        toast.success('Đăng ký thành công! Vui lòng đăng nhập.');
        navigate('/login');
      }

      return response;
    } catch (error) {
      // Error already handled by apiClient (toast shown)
      console.error('[Register Error]:', error);
      throw error;
    }
  };

  return { register };
}
