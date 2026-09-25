import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { cn } from '@/lib/utils';
import { getAccountDisplayName, getContactDisplayName, getInitial, directConversationId, groupConversationId, formatConversationTitle } from '@/utils';
import type { Contact, ConversationSummary, Group, TagItem } from '@/types';

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
  accountHubAlias?: string;
  accountDisplayName?: string;
  accountAvatar?: string;
  accountPhoneNumber?: string;
  isSessionActive?: boolean;
  className?: string;
  tags?: TagItem[];
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
  onSyncTags?: () => void;
  onReconnectAccount?: (accountId?: string) => void;
  onRenameAccount: (nextDisplayName: string) => Promise<void>;
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
  accountHubAlias,
  accountDisplayName,
  accountAvatar,
  accountPhoneNumber,
  isSessionActive = true,
  className,
  tags = [],
  selectedTagId,
  onSelectTag,
  onSyncTags,
  onReconnectAccount,
  onRenameAccount,
  onSelectConversation,
  onOpenDirectConversation,
  onOpenGroupConversation,
}: SidebarProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(accountHubAlias ?? '');
  const [renaming, setRenaming] = useState(false);
  const resolvedAccountLabel = getAccountDisplayName({
    accountId: workspaceAccountId,
    hubAlias: accountHubAlias,
    displayName: accountDisplayName,
    phoneNumber: accountPhoneNumber,
  });
  const resolvedAccountSubLabel = accountPhoneNumber?.trim() || workspaceAccountId || 'Chưa có thông tin phụ';

  useEffect(() => {
    setRenameValue(accountHubAlias ?? '');
  }, [accountHubAlias, workspaceAccountId]);

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextValue = renameValue.trim();
    if (!nextValue || renaming) return;
    setRenaming(true);
    try {
      await onRenameAccount(nextValue);
      setRenameOpen(false);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className={cn('w-[300px] min-w-[280px] border-r border-[var(--sidebar-border)] flex flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] overflow-hidden max-sm:w-[260px] max-sm:min-w-[240px] transition-colors', className)}>
      <div className="px-3.5 pt-3.5 pb-2.5 border-b border-[var(--sidebar-border)]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] px-3 py-3 shadow-xs">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 rounded-xl shrink-0">
              {accountAvatar ? <img src={accountAvatar} alt={resolvedAccountLabel} className="w-full h-full object-cover rounded-xl" /> : null}
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-sm font-extrabold rounded-xl">
                {getInitial(resolvedAccountLabel)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-sm font-semibold text-[var(--foreground)] truncate">
                  {resolvedAccountLabel}
                </div>
                <button
                  type="button"
                  onClick={() => setRenameOpen(true)}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  title="Đổi tên account"
                >
                  ✎
                </button>
                {!isSessionActive && onReconnectAccount && (
                  <button
                    type="button"
                    onClick={() => onReconnectAccount(workspaceAccountId)}
                    className="shrink-0 text-[11px] text-amber-500 hover:text-amber-400 transition-colors ml-auto flex items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium"
                    title="Kết nối lại tài khoản Zalo"
                  >
                    ⚡ Reconnect
                  </button>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {resolvedAccountSubLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={submitRename} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Đổi tên account</DialogTitle>
              <DialogDescription>
                Alias nội bộ sẽ ưu tiên hiển thị thay cho tên Zalo của account `{workspaceAccountId}`.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Nhập alias nội bộ cho account"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)} disabled={renaming}>
                Hủy
              </Button>
              <Button type="submit" disabled={renaming || !renameValue.trim()}>
                {renaming ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs value={sidebarTab} onValueChange={(v) => onTabChange(v as SidebarTab)} className="px-3.5 pt-3 pb-1.5">
        <TabsList className="w-full">
          <TabsTrigger value="conversations" className="flex-1">Cuộc trò chuyện</TabsTrigger>
          <TabsTrigger value="contacts" className="flex-1">Bạn bè</TabsTrigger>
          <TabsTrigger value="groups" className="flex-1">Nhóm</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="px-3.5 pb-2.5 space-y-2">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={sidebarTab === 'conversations' ? 'Tìm cuộc trò chuyện...' : sidebarTab === 'contacts' ? 'Tìm bạn bè...' : 'Tìm nhóm...'}
          className="h-10"
        />

        {sidebarTab === 'conversations' && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex-1 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors select-none text-left',
                    selectedTagId
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300 font-semibold'
                      : 'bg-[var(--muted)] border-[var(--border)] text-muted-foreground hover:text-[var(--foreground)]'
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span>🏷️</span>
                    <span className="truncate">
                      {selectedTagId
                        ? (() => {
                            const current = tags.find((t) => t.id === selectedTagId);
                            return current ? `${current.emoji ? `${current.emoji} ` : ''}${current.name}` : 'Đã chọn nhãn';
                          })()
                        : 'Lọc theo nhãn (Tất cả)'}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-60">▼</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-[var(--popover)] border border-[var(--border)] text-[var(--popover-foreground)] shadow-xl">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                  Phân loại nhãn Zalo
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[var(--border)]" />
                <DropdownMenuCheckboxItem
                  checked={!selectedTagId}
                  onCheckedChange={() => onSelectTag?.(null)}
                  className="text-xs cursor-pointer focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)]"
                >
                  <span>Tất cả cuộc trò chuyện</span>
                </DropdownMenuCheckboxItem>
                {tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagId === tag.id}
                    onCheckedChange={() => onSelectTag?.(selectedTagId === tag.id ? null : tag.id)}
                    className="text-xs cursor-pointer focus:bg-[var(--accent)] focus:text-[var(--accent-foreground)] flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                    <span className="truncate">{tag.emoji ? `${tag.emoji} ` : ''}{tag.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {onSyncTags && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSyncTags}
                className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-[var(--foreground)] hover:bg-[var(--accent)] shrink-0 border border-[var(--border)]"
                title="Đồng bộ danh sách nhãn từ Zalo"
              >
                🔄 Đồng bộ
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sidebarTab === 'conversations' && conversations.map((entry) => (
          (() => {
            const resolvedContact = entry.type === 'direct'
              ? contacts.find((contact) => contact.userId === entry.threadId)
              : undefined;
            const resolvedGroup = entry.type === 'group'
              ? groups.find((group) => group.groupId === entry.threadId)
              : undefined;
            const rawTitle = resolvedContact
              ? getContactDisplayName(resolvedContact)
              : resolvedGroup?.displayName ?? entry.title;
            const resolvedTitle = formatConversationTitle(rawTitle, entry.type, entry.threadId);
            const resolvedAvatar = resolvedContact?.avatar ?? resolvedGroup?.avatar ?? entry.avatar;
            const isActive = activeConversationId === entry.id;
            const showUnread = !isActive && (entry.unreadCount ?? 0) > 0;

            // Compute sender prefix for last message
            const senderPrefix = (() => {
              if (entry.lastDirection === 'outgoing') return 'Bạn: ';
              if (entry.type === 'group' && entry.lastMessageSenderName) {
                return `${entry.lastMessageSenderName}: `;
              }
              return '';
            })();

            return (
              <div
                key={entry.id}
                onClick={() => onSelectConversation(entry.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--accent)]/40 ${isActive ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}`}
              >
                {entry.type === 'group' ? (
                  <GroupAvatar
                    avatar={resolvedAvatar}
                    title={resolvedTitle}
                    members={resolvedGroup?.members}
                    memberAvatars={entry.memberAvatars}
                    contacts={contacts}
                    memberCount={resolvedGroup?.memberCount}
                    size="md"
                  />
                ) : (
                  <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
                    {resolvedAvatar ? <img src={resolvedAvatar} alt={resolvedTitle} className="w-full h-full object-cover rounded-full" /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                      {getInitial(resolvedTitle)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate flex items-center gap-1.5 ${showUnread ? 'font-bold text-[var(--foreground)]' : 'font-medium text-[var(--foreground)]/90'}`}>
                      <span className="truncate">{resolvedTitle}{entry.type === 'group' && !resolvedTitle.includes('Nhóm') ? ' (Nhóm)' : ''}</span>
                      {entry.isMuted && <span className="text-xs text-muted-foreground shrink-0" title="Đã tắt thông báo">🔕</span>}
                    </span>
                    {showUnread && (
                      <span className={`shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white rounded-full leading-none ${entry.isMuted ? 'bg-slate-400 dark:bg-slate-600' : 'bg-blue-600'}`}>
                        {entry.unreadCount > 99 ? '99+' : entry.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    <span className={senderPrefix ? 'font-medium text-[var(--foreground)]/80' : ''}>{senderPrefix}</span>
                    {entry.lastMessageKind !== 'text' ? `[${entry.lastMessageKind}] ` : ''}
                    {entry.lastMessageText}
                  </div>
                  {Array.isArray(entry.labels) && entry.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {entry.labels.map((lbl) => (
                        <span
                          key={lbl.id}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none text-white shrink-0"
                          style={{ backgroundColor: lbl.color || '#3b82f6' }}
                        >
                          {lbl.emoji ? `${lbl.emoji} ` : ''}{lbl.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ))}

        {sidebarTab === 'contacts' && contacts.map((entry) => {
          const contactConvId = directConversationId(entry.userId);
          const contactUnread = conversations.find(c => c.id === contactConvId)?.unreadCount || 0;
          const isActive = activeConversationId === contactConvId;
          const name = getContactDisplayName(entry);
          
          return (
            <div
              key={entry.userId}
              onClick={() => onOpenDirectConversation(entry)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--accent)]/40 ${isActive ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}`}
            >
              <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
                {entry.avatar ? <img src={entry.avatar} alt={name} className="w-full h-full object-cover rounded-full" /> : null}
                <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                  {getInitial(name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm truncate ${contactUnread > 0 && !isActive ? 'font-bold text-[var(--foreground)]' : 'font-medium text-[var(--foreground)]'}`}>
                    {name}
                  </span>
                  {contactUnread > 0 && !isActive && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-blue-600 rounded-full leading-none">
                      {contactUnread > 99 ? '99+' : contactUnread}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {entry.phoneNumber ? `📞 ${entry.phoneNumber}` : 'Nhấn để mở chat'}
                </div>
              </div>
            </div>
          );
        })}

        {sidebarTab === 'groups' && groups.map((entry) => (
          <div
            key={entry.groupId}
            onClick={() => onOpenGroupConversation(entry)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--accent)]/40 ${activeConversationId === groupConversationId(entry.groupId) ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}`}
          >
            <GroupAvatar
              avatar={entry.avatar}
              title={entry.displayName}
              members={entry.members}
              contacts={contacts}
              memberCount={entry.memberCount}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--foreground)] truncate">{entry.displayName}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.memberCount ? `${entry.memberCount} thành viên` : 'Nhấn để mở nhóm chat'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
