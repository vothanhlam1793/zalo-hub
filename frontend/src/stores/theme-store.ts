import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;
  
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  return resolved;
}

const savedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('zalohub_theme') : null) as ThemeMode || 'light';
const initialResolved = applyTheme(savedTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: savedTheme,
  resolvedTheme: initialResolved,
  setTheme: (theme: ThemeMode) => {
    localStorage.setItem('zalohub_theme', theme);
    const resolved = applyTheme(theme);
    set({ theme, resolvedTheme: resolved });
  },
  toggleTheme: () => {
    const current = get().resolvedTheme;
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

// Listen for system theme changes if set to 'system'
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') {
      const resolved = applyTheme('system');
      useThemeStore.setState({ resolvedTheme: resolved });
    }
  });
}
