import { Breadcrumb, UnderConstruction } from '@/components/Common';

export default function SettingsPage() {
  return (
    <div className="py-8 px-10">
      <h1 className="text-[2rem] font-semibold text-[#1a1d21] mb-2 m-0">Settings</h1>
      <Breadcrumb items={['Dashboard', 'Settings']} />
      <UnderConstruction />
    </div>
  );
}
