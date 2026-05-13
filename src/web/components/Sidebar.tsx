import { getContactDisplayName, getInitial, directConversationId, groupConversationId } from '../utils';
import type { Contact, ConversationSummary, Group } from '../types';

type SidebarTab = 'conversations' | 'contacts' | 'groups';

interface SidebarProps {
  sidebarTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  query: string;
  onQueryChange: (q: string) => void;
  conversations: ConversationSummary[];
  contacts: Contact[];
  groups: Group[];
  activeConversationId: string;
  workspaceAccountId: string;
  accounts: Array<{ accountId: string; displayName?: string }>;
  statusDisplayName: string;
  listenerConnected: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onSelectConversation: (id: string) => void;
  onOpenDirectConversation: (contact: Contact) => void;
  onOpenGroupConversation: (group: Group) => void;
}

export function Sidebar({
  sidebarTab,
  onTabChange,
  query,
  onQueryChange,
  conversations,
  contacts,
  groups,
  activeConversationId,
  workspaceAccountId,
  accounts,
  statusDisplayName,
  listenerConnected,
  onRefresh,
  onLogout,
  onSelectConversation,
  onOpenDirectConversation,
  onOpenGroupConversation,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div>
          <h2>Zalo Hub</h2>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            {accounts.find((a) => a.accountId === workspaceAccountId)?.displayName ?? statusDisplayName ?? 'Đã đăng nhập'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span className={`status-badge ${listenerConnected ? 'connected' : 'error'}`}>
            {listenerConnected ? 'Live' : 'Offline'}
          </span>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onRefresh}>
            Làm mới
          </button>
          <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 14px 6px' }}>
        <button className="btn btn-ghost" onClick={() => onTabChange('conversations')}>Cuộc trò chuyện</button>
        <button className="btn btn-ghost" onClick={() => onTabChange('contacts')}>Bạn bè</button>
        <button className="btn btn-ghost" onClick={() => onTabChange('groups')}>Nhóm</button>
      </div>

      <div style={{ padding: '0 14px 10px' }}>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={sidebarTab === 'conversations' ? 'Tìm cuộc trò chuyện...' : sidebarTab === 'contacts' ? 'Tìm bạn bè...' : 'Tìm nhóm...'}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #d7dce5' }}
        />
      </div>

      <div className="sidebar-body">
        {sidebarTab === 'conversations' && conversations.map((entry) => (
          <div
            key={entry.id}
            className={`conversation-item ${activeConversationId === entry.id ? 'active' : ''}`}
            onClick={() => onSelectConversation(entry.id)}
          >
            <div className="avatar">{getInitial(entry.title)}</div>
            <div className="conversation-info">
              <div className="conversation-name">{entry.title}{entry.type === 'group' ? ' (Nhóm)' : ''}</div>
              <div className="conversation-last">
                {entry.lastDirection === 'outgoing' ? 'Bạn: ' : ''}
                {entry.lastMessageKind !== 'text' ? `[${entry.lastMessageKind}] ` : ''}
                {entry.lastMessageText}
              </div>
            </div>
          </div>
        ))}

        {sidebarTab === 'contacts' && contacts.map((entry) => (
          <div
            key={entry.userId}
            className={`conversation-item ${activeConversationId === directConversationId(entry.userId) ? 'active' : ''}`}
            onClick={() => onOpenDirectConversation(entry)}
          >
            <div className="avatar">{getInitial(getContactDisplayName(entry))}</div>
            <div className="conversation-info">
              <div className="conversation-name">{getContactDisplayName(entry)}</div>
              <div className="conversation-last">Nhấn để mở chat</div>
            </div>
          </div>
        ))}

        {sidebarTab === 'groups' && groups.map((entry) => (
          <div
            key={entry.groupId}
            className={`conversation-item ${activeConversationId === groupConversationId(entry.groupId) ? 'active' : ''}`}
            onClick={() => onOpenGroupConversation(entry)}
          >
            <div className="avatar">{getInitial(entry.displayName)}</div>
            <div className="conversation-info">
              <div className="conversation-name">{entry.displayName}</div>
              <div className="conversation-last">{entry.memberCount ? `${entry.memberCount} thành viên` : 'Nhấn để mở nhóm chat'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
