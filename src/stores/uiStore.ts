import { create } from 'zustand';

interface UiState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

/** Trạng thái giao diện toàn cục: sidebar, loading overlay. */
export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
