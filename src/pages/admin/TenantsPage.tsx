import { Breadcrumb } from '@/components/Common';
import { UnderConstruction } from '@/components/Common';

export default function TenantsPage() {
  return (
    <div className="py-8 px-10">
      <h1 className="text-[2rem] font-semibold text-[#1a1d21] mb-2 m-0">Tenants</h1>
      <Breadcrumb items={['Super Admin', 'Tenants']} />
      <UnderConstruction />
    </div>
  );
}
