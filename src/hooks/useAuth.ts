import { useNavigate } from 'react-router-dom';

import { useAppStore } from '@/hooks/useAppStore';
import { apiClient } from '@/services/apiClient';

interface LoginResponse {
  success: boolean;
  user: {
    id: number;
    username: string;
    name: string;
    role: string;
  };
  token: string;
}

export function useAuth() {
  const navigate = useNavigate();
  const { setUser } = useAppStore();

  const login = async (username: string, password: string) => {
    const data = await apiClient.post<LoginResponse>('/auth/login', {
      username,
      password,
    });

    if (data.success) {
      localStorage.setItem('admin_token', data.token);
      setUser(data.user);
      navigate('/dashboard');
    }

    return data;
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    document.cookie = 'admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setUser(null);
    navigate('/login');
  };

  return { login, logout };
}
