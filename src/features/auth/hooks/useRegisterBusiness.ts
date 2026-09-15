import { useNavigate } from 'react-router-dom';

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

export interface RegisterBusinessResponse {
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

  /**
   * Submits the registration payload to the API.
   * On success: navigates to /login.
   * Toast messages must be shown by the calling component (not here) to allow i18n.
   */
  const register = async (formData: RegisterFormData): Promise<RegisterBusinessResponse> => {
    const payload: RegisterBusinessPayload = {
      fullName: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      companyName: formData.companyName,
      password: formData.password,
      ...(formData.taxId && formData.taxId.trim() !== '' ? { taxId: formData.taxId } : {}),
    };

    const response = await apiClient.post<RegisterBusinessResponse>('/v1/auth/register', payload, {
      requiresAuth: false,
    });

    if (response.success) {
      navigate('/login');
    }

    return response;
  };

  return { register };
}
