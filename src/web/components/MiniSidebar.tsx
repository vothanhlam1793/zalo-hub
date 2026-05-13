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
    <div className="mini-sidebar">
      <button className="mini-sidebar-add" type="button" title="Thêm tài khoản Zalo" onClick={onAddAccount}>
        +
      </button>

      <div className="mini-sidebar-list">
        {accounts.map((account) => {
          const isCurrent = account.sessionActive === true;
          const isSelected = account.accountId === (selectedAccountId || currentAccountId);
          const label = account.displayName ?? account.accountId;
          const subtitle = account.phoneNumber;
          const canActivate = account.sessionActive ?? account.accountId === currentAccountId;
          return (
            <button
              key={account.accountId}
              type="button"
              title={subtitle ? `${label} • ${subtitle}` : label}
              className={`mini-account ${isSelected ? 'active' : ''} ${isCurrent ? 'is-current' : ''}`}
              onClick={() => {
                if (!canActivate) {
                  onReLogin(account.accountId, label);
                  return;
                }
                onSelectAccount(account.accountId);
              }}
            >
              <span className="mini-account-avatar">{getInitial(label)}</span>
              {isCurrent && <span className="mini-account-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
