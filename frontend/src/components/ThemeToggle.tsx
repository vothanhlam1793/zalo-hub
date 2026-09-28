import { useThemeStore } from '@/stores/theme-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleTheme}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
            isDark
              ? 'bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-slate-700 shadow-sm'
              : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border border-slate-300 shadow-xs'
          } ${className || ''}`}
          title={isDark ? 'Chuyển sang chế độ Sáng (Light)' : 'Chuyển sang chế độ Tối (Dark)'}
        >
          {isDark ? (
            <span className="text-base leading-none">☀️</span>
          ) : (
            <span className="text-base leading-none">🌙</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isDark ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
      </TooltipContent>
    </Tooltip>
  );
}
