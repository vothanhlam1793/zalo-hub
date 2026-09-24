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
import { cn } from '@/lib/utils';
import { getAccountDisplayName, getContactDisplayName, getInitial, directConversationId, groupConversationId } from '@/utils';
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
              <DropdownMenuContent align="start" className="w-56 bg-[#121824] border-white/10 text-[#e2e8f0]">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                  Phân loại nhãn Zalo
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuCheckboxItem
                  checked={!selectedTagId}
                  onCheckedChange={() => onSelectTag?.(null)}
                  className="text-xs cursor-pointer focus:bg-white/10"
                >
                  <span>Tất cả cuộc trò chuyện</span>
                </DropdownMenuCheckboxItem>
                {tags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={selectedTagId === tag.id}
                    onCheckedChange={() => onSelectTag?.(selectedTagId === tag.id ? null : tag.id)}
                    className="text-xs cursor-pointer focus:bg-white/10 flex items-center gap-2"
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
                className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-white hover:bg-white/10 shrink-0 border border-white/5"
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
            const resolvedTitle = resolvedContact
              ? getContactDisplayName(resolvedContact)
              : resolvedGroup?.displayName ?? entry.title;
            const resolvedAvatar = resolvedContact?.avatar ?? resolvedGroup?.avatar ?? entry.avatar;
            const isActive = activeConversationId === entry.id;
            const showUnread = !isActive && (entry.unreadCount ?? 0) > 0;

            return (
              <div
                key={entry.id}
                onClick={() => onSelectConversation(entry.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--accent)]/40 ${isActive ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}`}
              >
                <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
                  {resolvedAvatar ? <img src={resolvedAvatar} alt={resolvedTitle} className="w-full h-full object-cover rounded-full" /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                    {getInitial(resolvedTitle)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate ${showUnread ? 'font-bold text-[var(--foreground)]' : 'font-medium text-[var(--foreground)]/90'}`}>{resolvedTitle}{entry.type === 'group' ? ' (Nhóm)' : ''}</span>
                    {showUnread && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-blue-600 rounded-full leading-none">
                        {entry.unreadCount > 99 ? '99+' : entry.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {entry.lastDirection === 'outgoing' ? 'Bạn: ' : ''}
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
          
          return (
            <div
              key={entry.userId}
              onClick={() => onOpenDirectConversation(entry)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${isActive ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
            >
              <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
                {entry.avatar ? <img src={entry.avatar} alt={getContactDisplayName(entry)} className="w-full h-full object-cover rounded-full" /> : null}
                <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                  {getInitial(getContactDisplayName(entry))}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${contactUnread > 0 && !isActive ? 'font-bold text-white' : 'font-semibold text-[#eee]'}`}>
                    {getContactDisplayName(entry)}
                  </span>
                  {contactUnread > 0 && !isActive && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-[#4f7aff] rounded-full leading-none">
                      {contactUnread > 99 ? '99+' : contactUnread}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#666] mt-0.5 truncate">Nhấn để mở chat</div>
              </div>
            </div>
          );
        })}

        {sidebarTab === 'groups' && groups.map((entry) => (
          <div
            key={entry.groupId}
            onClick={() => onOpenGroupConversation(entry)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${activeConversationId === groupConversationId(entry.groupId) ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
          >
            <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
              {entry.avatar ? <img src={entry.avatar} alt={entry.displayName} className="w-full h-full object-cover rounded-full" /> : null}
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
