import { create } from 'zustand';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
}

/** Phiên đăng nhập và người dùng hiện tại. */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
