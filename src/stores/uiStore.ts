import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UiState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  themeMode: ThemeMode;
  isDarkMode: boolean;
  setThemeMode: (mode: ThemeMode) => void;

  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

function resolveDarkMode(mode: ThemeMode) {
  return (
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

const storedTheme =
  typeof window !== 'undefined' ? window.localStorage.getItem('smartchain-theme') : null;
const initialTheme: ThemeMode =
  storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
    ? storedTheme
    : 'light';
const initialDarkMode = typeof window !== 'undefined' && resolveDarkMode(initialTheme);

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialDarkMode ? 'dark' : 'light';
}

/** Trạng thái giao diện toàn cục: sidebar, theme và loading overlay. */
export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),

  themeMode: initialTheme,
  isDarkMode: initialDarkMode,
  setThemeMode: (themeMode) => {
    const isDarkMode = resolveDarkMode(themeMode);
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
    window.localStorage.setItem('smartchain-theme', themeMode);
    set({ themeMode, isDarkMode });
  },

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
