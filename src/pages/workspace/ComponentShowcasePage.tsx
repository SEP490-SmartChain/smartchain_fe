import { useState } from 'react';

import {
  Search,
  Mail,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  Package,
  Truck,
  Calendar,
  MapPin,
  CheckCircle2,
  Trash2,
  Edit,
  Printer,
  FileText,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  Alert,
  Badge,
  Breadcrumb,
  Checkbox,
  Radio,
  Switch,
  Tabs,
  DatePicker,
  Avatar,
} from '@/components/Common';
import DataTable, { type ColumnDef } from '@/components/Common/DataTable/DataTable';
import Modal from '@/components/Common/Modal/Modal';
import Pagination from '@/components/Common/Pagination/Pagination';

// Sample data for DataTable
interface User {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'pending';
  orders: number;
}

const sampleUsers: User[] = [
  { id: 1, name: 'Nguyễn Văn A', email: 'nguyenvana@example.com', status: 'active', orders: 45 },
  { id: 2, name: 'Trần Thị B', email: 'tranthib@example.com', status: 'active', orders: 32 },
  { id: 3, name: 'Lê Văn C', email: 'levanc@example.com', status: 'pending', orders: 18 },
  { id: 4, name: 'Phạm Thị D', email: 'phamthid@example.com', status: 'inactive', orders: 0 },
  { id: 5, name: 'Hoàng Văn E', email: 'hoangvane@example.com', status: 'active', orders: 67 },
];

/**
 * Component Showcase Page
 * Demo tất cả common components với SmartChain theme dựa trên SaaSable Hosting.
 */
export default function ComponentShowcasePage() {
  const [alertVisible, setAlertVisible] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = useState('tab-1');

  const userColumns: ColumnDef<User>[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Full Name' },
    { key: 'email', label: 'Email Address' },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const statusMap = {
          active: { status: 'success', label: 'Active' },
          inactive: { status: 'default', label: 'Inactive' },
          pending: { status: 'warning', label: 'Pending' },
        } as const;
        const config = statusMap[row.status];
        return <Badge status={config.status} label={config.label} variant="solid" />;
      },
    },
    { key: 'orders', label: 'Total Orders' },
  ];

  return (
    <div className="min-h-screen bg-[var(--sc-bg-primary)]">
      {/* Simple Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--sc-border-default)] bg-white/95 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sc-primary)] text-lg font-semibold text-white">
              SC
            </span>
            <div>
              <h1 className="text-xl font-medium text-[var(--sc-text-primary)]">
                Component Showcase
              </h1>
              <p className="text-xs text-[var(--sc-text-secondary)]">SmartChain Design System</p>
            </div>
          </div>
          <a
            href="/"
            className="px-4 py-2 text-sm font-medium text-[var(--sc-text-secondary)] transition-colors hover:text-[var(--sc-primary-dark)]"
          >
            ← Back to Home
          </a>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto py-8 px-6">
        {/* Page Header */}
        <div className="mb-8">
          <Breadcrumb items={['Design System', 'Components', 'Showcase']} />
          <p className="mt-2 text-sm text-[var(--sc-text-secondary)]">
            Preview các component dùng theme Hosting, typography Archivo và motion của SmartChain.
          </p>
        </div>

        {/* Grid Layout */}
        <div className="space-y-8">
          {/* Buttons Section */}
          <Card>
            <CardHeader title="Buttons" description="Different button variants and sizes" />
            <CardContent>
              <div className="space-y-6">
                {/* Variants */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Variants</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary">Primary Button</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                  </div>
                </div>

                {/* Sizes */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Sizes</h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </div>

                {/* States */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">States</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button isLoading>Loading...</Button>
                    <Button disabled>Disabled</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Inputs Section */}
          <Card>
            <CardHeader title="Form Inputs" description="Text inputs and selects" />
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Email Address" type="email" placeholder="you@example.com" required />

                <Input label="Search" placeholder="Search..." leftIcon={<Search size={16} />} />

                <Input
                  label="Email with Icon"
                  type="email"
                  placeholder="Enter your email"
                  rightIcon={<Mail size={16} />}
                />

                <Input
                  label="With Error"
                  placeholder="Enter value"
                  error="This field is required"
                />

                <Select
                  label="Country"
                  options={[
                    { value: 'vn', label: 'Vietnam' },
                    { value: 'us', label: 'United States' },
                    { value: 'sg', label: 'Singapore' },
                  ]}
                  required
                />

                <Input
                  label="Disabled Input"
                  placeholder="Cannot edit"
                  disabled
                  value="Disabled value"
                />
              </div>
            </CardContent>
          </Card>

          {/* Advanced Form Inputs Section */}
          <Card>
            <CardHeader
              title="Advanced Form Inputs"
              description="Checkboxes, Radios, Switches, and Date Pickers"
            />
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1A1D21] border-b pb-2">Checkboxes</h4>
                  <Checkbox label="Remember me" />
                  <Checkbox label="Accept Terms & Conditions" defaultChecked />
                  <Checkbox label="Disabled Checked" disabled defaultChecked />
                  <Checkbox label="With Error" error="You must accept terms" />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1A1D21] border-b pb-2">Radios</h4>
                  <Radio name="shipping" label="Standard Delivery" defaultChecked />
                  <Radio name="shipping" label="Express Delivery" />
                  <Radio name="shipping" label="Disabled Option" disabled />
                  <Radio name="shipping2" label="With Error" error="Please select an option" />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1A1D21] border-b pb-2">
                    Switches (Toggles)
                  </h4>
                  <Switch label="Enable Notifications" defaultChecked />
                  <Switch label="Dark Mode" />
                  <Switch label="Auto-assign Orders" disabled defaultChecked />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1A1D21] border-b pb-2">
                    Date Picker
                  </h4>
                  <DatePicker label="Delivery Date" date={date} onChange={setDate} />
                  <DatePicker label="Disabled Picker" disabled />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation & Layout Section */}
          <Card>
            <CardHeader title="Navigation & Display" description="Tabs, Avatars, and Toasts" />
            <CardContent>
              <div className="space-y-10">
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-4">Underline Tabs</h4>
                  <Tabs
                    activeId={activeTab}
                    onChange={setActiveTab}
                    tabs={[
                      { id: 'tab-1', label: 'All Orders', badge: 124 },
                      { id: 'tab-2', label: 'Pending', badge: 12 },
                      { id: 'tab-3', label: 'Shipped', badge: 56 },
                      { id: 'tab-4', label: 'Returned', badge: 3 },
                    ]}
                  />
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-4">Pills Tabs</h4>
                  <Tabs
                    variant="pills"
                    activeId={activeTab}
                    onChange={setActiveTab}
                    tabs={[
                      { id: 'tab-1', label: 'Analytics', icon: <Package size={16} /> },
                      { id: 'tab-2', label: 'Carriers', icon: <Truck size={16} /> },
                      { id: 'tab-3', label: 'Settings', icon: <Settings size={16} /> },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1D21] mb-4">Avatars</h4>
                    <div className="flex items-center gap-4">
                      <Avatar size="sm" fallback="SM" />
                      <Avatar size="md" fallback="MD" />
                      <Avatar size="lg" fallback="LG" />
                      <Avatar
                        size="xl"
                        fallback="GH"
                        src="https://ui-avatars.com/api/?name=GHN&background=0F766E&color=fff"
                      />
                      <Avatar size="xl" fallback="JS" src="invalid-url.jpg" />
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1D21] mb-4">
                      Toast Notifications (Sonner)
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.success('Order #1234 has been shipped successfully!')}
                      >
                        Success
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.error('Failed to update inventory.')}
                      >
                        Error
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.warning('Low stock alert for SKU-998.')}
                      >
                        Warning
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.info('System maintenance scheduled at midnight.')}
                      >
                        Info
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Icons Section */}
          <Card>
            <CardHeader
              title="Logistics Icons (Lucide React)"
              description="Các icon chuẩn thường dùng trong hệ thống SmartChain"
            />
            <CardContent>
              {/* Hướng dẫn import */}
              <div className="mb-6 p-4 bg-[#1A1D21] rounded-lg">
                <code className="text-[#00E599] text-sm">
                  import {'{'} Upload, Download, Package, Truck, ... {'}'} from 'lucide-react';
                </code>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Upload className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Upload</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Download className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Download</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <FileSpreadsheet
                    className="text-[#475569] group-hover:text-[#0F766E] mb-2"
                    size={24}
                  />
                  <span className="text-xs text-[#64748B]">Excel / Import</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Package className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Package / Order</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Truck className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Truck / Carrier</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <MapPin className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Location / Hub</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <CheckCircle2 className="text-[#10B981] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Success / Done</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Trash2 className="text-[#EF4444] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Delete</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Edit className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Edit</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Printer className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Print Label</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <FileText className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Document / Rule</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg hover:border-[#0F766E] transition-colors group">
                  <Calendar className="text-[#475569] group-hover:text-[#0F766E] mb-2" size={24} />
                  <span className="text-xs text-[#64748B]">Date / Time</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Badges" description="Status indicators with different styles" />
            <CardContent>
              <div className="space-y-6">
                {/* Dot variant */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Dot Style</h4>
                  <div className="flex flex-wrap gap-4">
                    <Badge status="success" label="Approved" variant="dot" />
                    <Badge status="warning" label="Pending" variant="dot" />
                    <Badge status="error" label="Rejected" variant="dot" />
                    <Badge status="info" label="In Progress" variant="dot" />
                    <Badge status="default" label="Draft" variant="dot" />
                  </div>
                </div>

                {/* Solid variant */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Solid Style</h4>
                  <div className="flex flex-wrap gap-3">
                    <Badge status="success" label="Completed" variant="solid" />
                    <Badge status="warning" label="Warning" variant="solid" />
                    <Badge status="error" label="Failed" variant="solid" />
                    <Badge status="info" label="Information" variant="solid" />
                    <Badge status="default" label="Neutral" variant="solid" />
                  </div>
                </div>

                {/* Outline variant */}
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Outline Style</h4>
                  <div className="flex flex-wrap gap-3">
                    <Badge status="success" label="Active" variant="outline" />
                    <Badge status="warning" label="Review" variant="outline" />
                    <Badge status="error" label="Critical" variant="outline" />
                    <Badge status="info" label="Beta" variant="outline" />
                    <Badge status="default" label="Standard" variant="outline" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerts Section */}
          <Card>
            <CardHeader title="Alerts" description="Notification messages" />
            <CardContent>
              <div className="space-y-4">
                <Alert variant="success" title="Success">
                  Your changes have been saved successfully.
                </Alert>

                <Alert variant="warning" title="Warning">
                  This action cannot be undone. Please review before proceeding.
                </Alert>

                <Alert variant="error" title="Error">
                  Unable to process your request. Please try again later.
                </Alert>

                <Alert variant="info" title="Information">
                  New features are now available. Check out the changelog for details.
                </Alert>

                {alertVisible && (
                  <Alert
                    variant="success"
                    title="Dismissible Alert"
                    onClose={() => setAlertVisible(false)}
                  >
                    This alert can be closed by clicking the X button.
                  </Alert>
                )}

                {!alertVisible && (
                  <Button size="sm" onClick={() => setAlertVisible(true)}>
                    Show Dismissible Alert Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cards Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card variant="default" padding="md">
              <h3 className="font-semibold text-[#1A1D21] mb-2">Default Card</h3>
              <p className="text-sm text-[#6A6E76]">
                Standard card with default border and padding.
              </p>
            </Card>

            <Card variant="bordered" padding="md">
              <h3 className="font-semibold text-[#1A1D21] mb-2">Bordered Card</h3>
              <p className="text-sm text-[#6A6E76]">Card with thicker border for emphasis.</p>
            </Card>

            <Card variant="elevated" padding="md">
              <h3 className="font-semibold text-[#1A1D21] mb-2">Elevated Card</h3>
              <p className="text-sm text-[#6A6E76]">Card with shadow for depth effect.</p>
            </Card>
          </div>

          {/* Color Palette Reference */}
          <Card>
            <CardHeader title="Color Palette" description="SmartChain design tokens reference" />
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="flex h-16 items-center justify-center rounded-lg bg-[var(--sc-primary)]">
                    <span className="text-sm font-semibold text-white">#606BDF</span>
                  </div>
                  <p className="text-xs text-[#6A6E76] text-center">Primary Brand</p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-16 items-center justify-center rounded-lg bg-[var(--sc-primary-light)]">
                    <span className="text-sm font-semibold text-[var(--sc-primary-darker)]">
                      #BDC2FF
                    </span>
                  </div>
                  <p className="text-xs text-[#6A6E76] text-center">Secondary Accent</p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-16 items-center justify-center rounded-lg bg-[var(--sc-text-primary)]">
                    <span className="text-sm font-semibold text-white">#1B1B1F</span>
                  </div>
                  <p className="text-xs text-[#6A6E76] text-center">Text Primary</p>
                </div>

                <div className="space-y-2">
                  <div className="flex h-16 items-center justify-center rounded-lg border-2 border-[var(--sc-border-default)] bg-[var(--sc-bg-primary)]">
                    <span className="text-sm font-semibold text-[var(--sc-text-primary)]">
                      #FBF8FF
                    </span>
                  </div>
                  <p className="text-xs text-[#6A6E76] text-center">BG Primary</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DataTable Section */}
          <Card>
            <CardHeader
              title="DataTable"
              description="Table component with sorting and pagination"
              action={
                <Button size="sm" variant="primary">
                  <Plus size={16} />
                  Add User
                </Button>
              }
            />
            <CardContent>
              <DataTable
                columns={userColumns}
                data={sampleUsers}
                pagination={{
                  currentPage: currentPage,
                  totalPages: 3,
                  onPageChange: setCurrentPage,
                }}
              />
            </CardContent>
          </Card>

          {/* Pagination Standalone */}
          <Card>
            <CardHeader
              title="Pagination"
              description="Standalone pagination component with page size selector"
            />
            <CardContent>
              <Pagination
                currentPage={currentPage}
                totalPages={5}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
              <div className="mt-4 p-4 bg-[#F7F8FA] rounded-lg">
                <p className="text-sm text-[#6A6E76]">
                  Current Page: <span className="font-semibold text-[#1A1D21]">{currentPage}</span>
                  {' / '}
                  Page Size: <span className="font-semibold text-[#1A1D21]">{pageSize}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Modal Section */}
          <Card>
            <CardHeader title="Modal" description="Dialog overlay component" />
            <CardContent>
              <div className="space-y-4">
                <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
                <p className="text-sm text-[#6A6E76]">
                  Click the button to see the modal in action. Press ESC or click outside to close.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Modal Component */}
          <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Example Modal">
            <div className="space-y-4">
              <p className="text-sm text-[#6A6E76]">
                This is a modal dialog. You can put any content here like forms, confirmations, or
                detailed information.
              </p>

              <Input label="Full Name" placeholder="Enter your name" required />

              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                rightIcon={<Mail size={16} />}
              />

              <Select
                label="Department"
                options={[
                  { value: 'eng', label: 'Engineering' },
                  { value: 'sales', label: 'Sales' },
                  { value: 'hr', label: 'Human Resources' },
                ]}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>

          {/* Typography & Spacing */}
          <Card>
            <CardHeader
              title="Typography & Spacing"
              description="Text styles and spacing examples"
            />
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h1 className="text-4xl font-bold text-[#1A1D21] mb-2">Heading 1</h1>
                  <h2 className="text-3xl font-bold text-[#1A1D21] mb-2">Heading 2</h2>
                  <h3 className="text-2xl font-semibold text-[#1A1D21] mb-2">Heading 3</h3>
                  <h4 className="text-xl font-semibold text-[#1A1D21] mb-2">Heading 4</h4>
                  <h5 className="text-lg font-medium text-[#1A1D21] mb-2">Heading 5</h5>
                </div>

                <div className="space-y-2">
                  <p className="text-base text-[#1A1D21]">
                    Body text regular - Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                  </p>
                  <p className="text-sm text-[#6A6E76]">
                    Secondary text - Used for descriptions and less important information.
                  </p>
                  <p className="text-xs text-[#9CA3AF]">
                    Tertiary text - Used for hints, placeholders, or disabled states.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <span className="px-3 py-1 bg-[#E5FFF6] text-[#00E599] rounded-full text-xs font-semibold">
                    Pill Badge
                  </span>
                  <span className="px-2 py-0.5 bg-[#F7F8FA] text-[#6A6E76] rounded text-xs font-medium">
                    Small Label
                  </span>
                  <code className="px-2 py-1 bg-[#1A1D21] text-[#00E599] rounded text-xs font-mono">
                    code snippet
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading States */}
          <Card>
            <CardHeader title="Loading States" description="Components with loading indicators" />
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Buttons Loading</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary" isLoading>
                      Processing...
                    </Button>
                    <Button variant="secondary" isLoading>
                      Loading
                    </Button>
                    <Button variant="outline" isLoading size="sm">
                      Please wait
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Empty DataTable</h4>
                  <DataTable columns={userColumns} data={[]} />
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-[#1A1D21] mb-3">Loading DataTable</h4>
                  <DataTable columns={userColumns} data={[]} isLoading />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[#E5E7EB] text-center">
          <p className="text-sm text-[#6A6E76]">
            SmartChain Design System v1.0 • Built with React 19 + Tailwind CSS 4
          </p>
          <p className="text-xs text-[#9CA3AF] mt-2">
            <a href="/login" className="hover:text-[#00E599] transition-colors">
              Login to Dashboard
            </a>
            {' • '}
            <a
              href="https://github.com/smartchain"
              className="hover:text-[#00E599] transition-colors"
            >
              Documentation
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
