import { useState } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';

import { getPostLoginPath } from '@/lib/authRedirect';
import { apiClient, type LoginInput } from '@/services/apiClient';

export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const login = async (input: LoginInput) => {
    const user = await apiClient.login(input);
    navigate(getPostLoginPath(user, location.state), { replace: true });
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await apiClient.logout();
      navigate('/login', { replace: true });
    } catch {
      // apiClient displays the failure; retain the session so logout can be retried.
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { login, logout, isLoggingOut, refreshUser: () => apiClient.currentUser() };
}
