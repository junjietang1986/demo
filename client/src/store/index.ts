import { create } from 'zustand';
import { User, UserPermissions } from '@/types';

interface AppState {
  user: User | null;
  token: string | null;
  collapsed: boolean;
  permissions: UserPermissions | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setCollapsed: (collapsed: boolean) => void;
  setPermissions: (permissions: UserPermissions | null) => void;
  hasPermission: (moduleCode: string, action?: 'view' | 'edit' | 'delete' | 'approve') => boolean;
  logout: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  collapsed: false,
  permissions: JSON.parse(localStorage.getItem('permissions') || 'null'),
  setUser: (user) => {
    set({ user });
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  },
  setToken: (token) => {
    set({ token });
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },
  setCollapsed: (collapsed) => set({ collapsed }),
  setPermissions: (permissions) => {
    set({ permissions });
    if (permissions) {
      localStorage.setItem('permissions', JSON.stringify(permissions));
    } else {
      localStorage.removeItem('permissions');
    }
  },
  hasPermission: (moduleCode: string, action: 'view' | 'edit' | 'delete' | 'approve' = 'view') => {
    const { user, permissions } = get();
    if (!user || !permissions) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    const perm = permissions.permissions[moduleCode];
    if (!perm) return false;
    switch (action) {
      case 'view': return perm.can_view;
      case 'edit': return perm.can_edit;
      case 'delete': return perm.can_delete;
      case 'approve': return perm.can_approve;
      default: return false;
    }
  },
  logout: () => {
    set({ user: null, token: null, permissions: null });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
  }
}));
