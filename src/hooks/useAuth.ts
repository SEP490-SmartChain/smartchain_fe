import { useState } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';

import { getPostLoginPath } from '@/lib/authRedirect';
import { ApiError, apiClient, type LoginInput } from '@/services/apiClient';

export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<{ message?: string }>();

  const login = async (input: LoginInput) => {
    const user = await apiClient.login(input);
    navigate(getPostLoginPath(user, location.state), { replace: true });
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setLogoutError(undefined);
    setIsLoggingOut(true);
    try {
      await apiClient.logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(error instanceof ApiError ? { message: error.message } : {});
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { login, logout, isLoggingOut, logoutError, refreshUser: () => apiClient.currentUser() };
}
