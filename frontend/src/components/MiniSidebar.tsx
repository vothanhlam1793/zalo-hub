import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getAccountDisplayName, getInitial } from '../utils';
import type { AccountSummary } from '../types';

interface MiniSidebarProps {
  accounts: Array<AccountSummary & { isActive?: boolean; sessionActive?: boolean; phoneNumber?: string; visible?: boolean }>;
  selectedAccountId: string;
  currentAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onOpenAdmin: () => void;
}

export function MiniSidebar({ accounts, selectedAccountId, currentAccountId, onSelectAccount, onOpenAdmin }: MiniSidebarProps) {
  const visibleAccounts = accounts.filter(a => a.visible !== false);

  return (
    <div className="w-[72px] min-w-[72px] border-r border-[var(--border)] bg-[#0d1219] flex flex-col items-center gap-[14px] p-[14px_10px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="w-11 h-11 rounded-2xl border border-[rgba(95,212,255,0.22)] bg-[rgba(79,122,255,0.16)] text-[#8ec5ff] inline-flex items-center justify-center cursor-pointer text-2xl font-medium transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7"
          >
            +
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Quản lý tài khoản</TooltipContent>
      </Tooltip>

      <div className="flex-1 flex flex-col items-center gap-[10px] w-full">
        {visibleAccounts.map((account) => {
          const isCurrent = account.sessionActive === true;
          const isSelected = account.accountId === (selectedAccountId || currentAccountId);
          const label = getAccountDisplayName(account);
          const subtitle = account.phoneNumber;

          return (
            <Tooltip key={account.accountId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'relative w-11 h-11 rounded-2xl border border-white/8 bg-white/4 text-[#d9e4ff] inline-flex items-center justify-center cursor-pointer transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7',
                    isSelected && 'bg-[rgba(79,122,255,0.18)] border-[rgba(95,212,255,0.34)] shadow-[inset_0_0_0_1px_rgba(95,212,255,0.14)]'
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
                    <span className="absolute right-1 bottom-1 w-2 h-2 rounded-full bg-[#54da88] shadow-[0_0_0_2px_#0d1219]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <div className="font-medium">{label}</div>
                  {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenAdmin}
            className="w-11 h-11 rounded-2xl border border-white/8 bg-white/4 text-[#c9d6f3] hover:bg-white/8 hover:text-white"
          >
            ⚙
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Quản trị hệ thống</TooltipContent>
      </Tooltip>
    </div>
  );
}
