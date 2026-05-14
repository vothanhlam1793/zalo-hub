import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  onSyncAll: () => void;
  syncingAll: boolean;
  userDisplayName?: string;
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
  onSyncAll,
  syncingAll,
  userDisplayName,
}: SidebarProps) {
  const currentDisplayName = accounts.find((a) => a.accountId === workspaceAccountId)?.displayName ?? statusDisplayName ?? 'Đã đăng nhập';

  return (
    <div className="w-[300px] min-w-[280px] border-r border-[var(--sidebar-border)] flex flex-col bg-[var(--sidebar)] overflow-hidden max-sm:w-[260px] max-sm:min-w-[240px]">
      <div className="p-4 border-b border-[var(--sidebar-border)] flex items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-base font-bold text-[#eee]">Zalo Hub</h2>
          <div className="text-xs text-muted-foreground mt-0.5">{userDisplayName || currentDisplayName}</div>
          {userDisplayName && <div className="text-[10px] text-muted-foreground/60">{currentDisplayName}</div>}
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <Badge variant={listenerConnected ? 'default' : 'destructive'} className="text-[11px]">
            {listenerConnected ? 'Live' : 'Offline'}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-auto py-1 px-2.5 text-xs">
            Làm mới
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSyncAll}
            disabled={syncingAll}
            className="h-auto py-1 px-2.5 text-xs bg-[rgba(79,122,255,0.15)] hover:bg-[rgba(79,122,255,0.25)] text-[#7fa8ff]"
          >
            {syncingAll ? '⏳ Đang đồng bộ...' : '📱 Đồng bộ từ ĐT'}
          </Button>
          <Button variant="destructive" size="sm" onClick={onLogout} className="h-auto py-1 px-2.5 text-xs">
            Đăng xuất
          </Button>
        </div>
      </div>

      <Tabs value={sidebarTab} onValueChange={(v) => onTabChange(v as SidebarTab)} className="px-3.5 pt-3 pb-1.5">
        <TabsList className="w-full">
          <TabsTrigger value="conversations" className="flex-1">Cuộc trò chuyện</TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1">Bạn bè</TabsTrigger>
          <TabsTrigger value="groups" className="flex-1">Nhóm</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="px-3.5 pb-2.5">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={sidebarTab === 'conversations' ? 'Tìm cuộc trò chuyện...' : sidebarTab === 'contacts' ? 'Tìm bạn bè...' : 'Tìm nhóm...'}
          className="h-10"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sidebarTab === 'conversations' && conversations.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onSelectConversation(entry.id)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${activeConversationId === entry.id ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
          >
            <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                {getInitial(entry.title)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#eee] truncate">{entry.title}{entry.type === 'group' ? ' (Nhóm)' : ''}</div>
              <div className="text-xs text-[#666] mt-0.5 truncate">
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
            onClick={() => onOpenDirectConversation(entry)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${activeConversationId === directConversationId(entry.userId) ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
          >
            <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                {getInitial(getContactDisplayName(entry))}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#eee] truncate">{getContactDisplayName(entry)}</div>
              <div className="text-xs text-[#666] mt-0.5 truncate">Nhấn để mở chat</div>
            </div>
          </div>
        ))}

        {sidebarTab === 'groups' && groups.map((entry) => (
          <div
            key={entry.groupId}
            onClick={() => onOpenGroupConversation(entry)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${activeConversationId === groupConversationId(entry.groupId) ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
          >
            <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                {getInitial(entry.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#eee] truncate">{entry.displayName}</div>
              <div className="text-xs text-[#666] mt-0.5 truncate">{entry.memberCount ? `${entry.memberCount} thành viên` : 'Nhấn để mở nhóm chat'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
