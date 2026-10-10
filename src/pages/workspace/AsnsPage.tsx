import { AsnWorkspace } from '@/features/inbound';
import { useAuthStore } from '@/stores/authStore';

export default function AsnsPage() {
  const user = useAuthStore((state) => state.user);
  return (
    <AsnWorkspace
      key={`${user?.actorScope}-${user?.tenantId}-${user?.userId}-${user?.roles.join(',')}`}
    />
  );
}
