import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getAccountDisplayName, getInitial } from '@/utils';
import type { AccountSummary, ConversationSummary } from '@/types';

interface MiniSidebarProps {
  accounts: Array<AccountSummary & { isActive?: boolean; sessionActive?: boolean; phoneNumber?: string; visible?: boolean }>;
  selectedAccountId: string;
  currentAccountId: string;
  conversations: ConversationSummary[];
  onSelectAccount: (accountId: string) => void;
  onOpenAdmin: () => void;
}

export function MiniSidebar({ accounts, selectedAccountId, currentAccountId, conversations, onSelectAccount, onOpenAdmin }: MiniSidebarProps) {
  const visibleAccounts = accounts.filter(a => a.visible !== false);

  // Tính tổng unread per account
  const getAccountUnreadCount = (accountId: string) => {
    return conversations
      .filter(c => c.accountId === accountId)
      .reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  };

  return (
    <div className="w-[72px] min-w-[72px] border-r border-[var(--border)] bg-[var(--card)] flex flex-col items-center justify-between p-3 gap-3 transition-colors">
      {/* Top: Add account */}
      <div className="flex flex-col items-center gap-3 w-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-11 h-11 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-500 dark:text-blue-400 inline-flex items-center justify-center cursor-pointer text-2xl font-medium transition-all duration-150 hover:scale-105 hover:bg-blue-500/20"
            >
              +
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Quản lý tài khoản</TooltipContent>
        </Tooltip>

        {/* Account list */}
        <div className="flex flex-col items-center gap-2.5 w-full">
          {visibleAccounts.map((account) => {
            const isCurrent = account.sessionActive === true;
            const isSelected = account.accountId === (selectedAccountId || currentAccountId);
            const isInactive = account.hasCredential === true && account.sessionActive !== true;
            const needsLogin = account.hasCredential === false;
            const label = getAccountDisplayName(account);
            const subtitle = account.phoneNumber;
            const unreadCount = getAccountUnreadCount(account.accountId);

            return (
              <Tooltip key={account.accountId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'relative w-11 h-11 rounded-2xl border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] inline-flex items-center justify-center cursor-pointer transition-all duration-150 hover:scale-105',
                      isSelected && 'bg-blue-500/15 border-blue-500/50 ring-2 ring-blue-500/30 shadow-md'
                    )}
                    onClick={() => onSelectAccount(account.accountId)}
                  >
                    <Avatar className="w-8 h-8 rounded-xl">
                      {account.avatar ? <img src={account.avatar} alt={label} className="w-full h-full object-cover rounded-xl" /> : null}
                      <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-sm font-extrabold rounded-xl">
                        {getInitial(label)}
                      </AvatarFallback>
                    </Avatar>
                    {isCurrent && (
                      <span className="absolute right-1 bottom-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--card)]" />
                    )}
                    {isInactive && (
                      <span className="absolute right-1 bottom-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--card)]" />
                    )}
                    {needsLogin && (
                      <span className="absolute right-1 bottom-1 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-[var(--card)]" />
                    )}
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center shadow-md">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="text-xs">
                    <div className="font-semibold">{label}</div>
                    {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
                    {isCurrent && <div className="text-emerald-500 font-medium mt-1">Đang hoạt động</div>}
                    {isInactive && <div className="text-amber-500 font-medium mt-1">Chưa active session</div>}
                    {needsLogin && <div className="text-slate-400 font-medium mt-1">Chưa đăng nhập</div>}
                    {unreadCount > 0 && <div className="text-red-500 font-bold mt-1">{unreadCount} tin chưa đọc</div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Bottom: Theme toggle & Settings */}
      <div className="flex flex-col items-center gap-2.5 w-full pt-2 border-t border-[var(--border)]">
        <ThemeToggle />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenAdmin}
              className="w-9 h-9 rounded-xl border border-[var(--border)] text-muted-foreground hover:text-foreground hover:bg-[var(--accent)]"
            >
              ⚙
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Quản trị hệ thống</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
