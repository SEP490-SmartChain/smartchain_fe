import { create } from 'zustand';

interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

interface AppState {
  // Sidebar State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  // User State
  user: User | null;
  setUser: (user: User | null) => void;

  // App Loading State
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Locale State
  locale: string;
  setLocale: (locale: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

  user: null,
  setUser: (user) => set({ user }),

  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),

  locale: localStorage.getItem('APP_LOCALE') || 'vi',
  setLocale: (locale) => {
    localStorage.setItem('APP_LOCALE', locale);
    set({ locale });
  },
}));
