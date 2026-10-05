import { useState } from 'react';

import { Plus } from 'lucide-react';

import { Button } from '@/components/Common/Button/Button';
import { Can } from '@/components/Common/Can/Can';
import AddWarehouseModal from '@/features/catalog/components/AddWarehouseModal';
import WarehouseDirectory from '@/features/catalog/components/WarehouseDirectory';

/**
 * ORCA Admin quản lý kho (UI-06). Form tạo kho chuyển từ `/warehouses` sang đây;
 * tab Khu / Ô kệ chờ API BE-02 nên chưa có.
 */
export default function AdminWarehousesPage() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  // Đổi key để danh sách kho tải lại sau khi tạo kho mới.
  const [listVersion, setListVersion] = useState(0);

  return (
    <>
      <WarehouseDirectory
        key={listVersion}
        headerAction={
          <Can capability="warehouses.manage">
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Thêm kho mới
            </Button>
          </Can>
        }
      />
      <AddWarehouseModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setAddModalOpen(false);
          setListVersion((version) => version + 1);
        }}
      />
    </>
  );
}
