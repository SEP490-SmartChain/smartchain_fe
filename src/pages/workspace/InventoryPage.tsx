import { Breadcrumb } from '@/components/Common';
import { UnderConstruction } from '@/components/Common';

export default function InventoryPage() {
  return (
    <div className="py-8 px-10">
      <h1 className="text-[2rem] font-semibold text-[#1a1d21] mb-2 m-0">Inventory</h1>
      <Breadcrumb items={['Workspace', 'Inventory']} />
      <UnderConstruction />
    </div>
  );
}
