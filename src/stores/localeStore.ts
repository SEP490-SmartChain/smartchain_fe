import { create } from 'zustand';

const STORAGE_KEY = 'APP_LOCALE';

interface LocaleState {
  locale: string;
  setLocale: (locale: string) => void;
}

/** Ngôn ngữ đang chọn (vi | en), ghi nhớ trong localStorage. */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale:
    (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'vi',
  setLocale: (locale) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
    set({ locale });
  },
}));
