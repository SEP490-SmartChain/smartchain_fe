import { DemandForecast } from '@/features/inventory';
import { useAuthStore } from '@/stores/authStore';

export default function DemandForecastPage() {
  const revision = useAuthStore((state) => state.revision);
  return <DemandForecast key={revision} />;
}
