import Breadcrumb from '@/components/common/Breadcrumb';
import UnderConstruction from '@/components/common/UnderConstruction';

export default function HelpPage() {
  return (
    <div className="py-8 px-10">
      <h1 className="text-[2rem] font-semibold text-[#1a1d21] mb-2 m-0">Help</h1>
      <Breadcrumb items={['Dashboard', 'Help']} />
      <UnderConstruction />
    </div>
  );
}
