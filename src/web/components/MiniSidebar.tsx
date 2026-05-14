import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitial } from '../utils';
import type { AccountSummary } from '../types';

interface MiniSidebarProps {
  accounts: Array<AccountSummary & { isActive?: boolean; sessionActive?: boolean; phoneNumber?: string }>;
  selectedAccountId: string;
  currentAccountId: string;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onReLogin: (accountId: string, label: string) => void;
}

export function MiniSidebar({ accounts, selectedAccountId, currentAccountId, onAddAccount, onSelectAccount, onReLogin }: MiniSidebarProps) {
  return (
    <div className="w-[72px] min-w-[72px] border-r border-[var(--border)] bg-[#0d1219] flex flex-col items-center gap-[14px] p-[14px_10px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onAddAccount}
            className="w-11 h-11 rounded-2xl border border-[rgba(95,212,255,0.22)] bg-[rgba(79,122,255,0.16)] text-[#8ec5ff] inline-flex items-center justify-center cursor-pointer text-2xl font-medium transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7"
          >
            +
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Thêm tài khoản Zalo</TooltipContent>
      </Tooltip>

      <div className="flex flex-col items-center gap-[10px] w-full">
        {accounts.map((account) => {
          const isCurrent = account.sessionActive === true;
          const isSelected = account.accountId === (selectedAccountId || currentAccountId);
          const label = account.displayName ?? account.accountId;
          const subtitle = account.phoneNumber;
          const canActivate = account.sessionActive ?? account.accountId === currentAccountId;

          return (
            <Tooltip key={account.accountId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'relative w-11 h-11 rounded-2xl border border-white/8 bg-white/4 text-[#d9e4ff] inline-flex items-center justify-center cursor-pointer transition-all duration-[0.12s] hover:-translate-y-px hover:border-white/18 hover:bg-white/7',
                    isSelected && 'bg-[rgba(79,122,255,0.18)] border-[rgba(95,212,255,0.34)] shadow-[inset_0_0_0_1px_rgba(95,212,255,0.14)]'
                  )}
                  onClick={() => {
                    if (!canActivate) {
                      onReLogin(account.accountId, label);
                      return;
                    }
                    onSelectAccount(account.accountId);
                  }}
                >
                  <Avatar className="w-8 h-8 rounded-xl">
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
    </div>
  );
}
