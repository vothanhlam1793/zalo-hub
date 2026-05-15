import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAccountDisplayName, getContactDisplayName, getInitial, directConversationId, groupConversationId } from '../utils';
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
  accountHubAlias?: string;
  accountDisplayName?: string;
  accountAvatar?: string;
  accountPhoneNumber?: string;
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
    <div className="w-[300px] min-w-[280px] border-r border-[var(--sidebar-border)] flex flex-col bg-[var(--sidebar)] overflow-hidden max-sm:w-[260px] max-sm:min-w-[240px]">
      <div className="px-3.5 pt-3.5 pb-2.5 border-b border-[var(--sidebar-border)]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 rounded-xl shrink-0">
              {accountAvatar ? <img src={accountAvatar} alt={resolvedAccountLabel} className="w-full h-full object-cover rounded-xl" /> : null}
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-sm font-extrabold rounded-xl">
                {getInitial(resolvedAccountLabel)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-sm font-semibold text-[#eef2ff] truncate">
                  {resolvedAccountLabel}
                </div>
                <button
                  type="button"
                  onClick={() => setRenameOpen(true)}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-[#9fc0ff] transition-colors"
                  title="Đổi tên account"
                >
                  ✎
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-1">
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
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/4 transition-colors hover:bg-white/4 ${isActive ? 'bg-[rgba(79,122,255,0.12)]' : ''}`}
              >
                <Avatar className="w-[42px] h-[42px] rounded-full shrink-0">
                  {resolvedAvatar ? <img src={resolvedAvatar} alt={resolvedTitle} className="w-full h-full object-cover rounded-full" /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] text-base font-bold">
                    {getInitial(resolvedTitle)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${showUnread ? 'font-bold text-white' : 'font-semibold text-[#eee]'}`}>{resolvedTitle}{entry.type === 'group' ? ' (Nhóm)' : ''}</span>
                    {showUnread && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-[#4f7aff] rounded-full leading-none">
                        {entry.unreadCount > 99 ? '99+' : entry.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#666] mt-0.5 truncate">
                    {entry.lastDirection === 'outgoing' ? 'Bạn: ' : ''}
                    {entry.lastMessageKind !== 'text' ? `[${entry.lastMessageKind}] ` : ''}
                    {entry.lastMessageText}
                  </div>
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
