import { Navigate } from 'react-router-dom';

import { getHomePath } from '@/lib/authRedirect';
import { useAuthStore } from '@/stores/authStore';

export default function HomePage() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={getHomePath(user)} replace />;
}
