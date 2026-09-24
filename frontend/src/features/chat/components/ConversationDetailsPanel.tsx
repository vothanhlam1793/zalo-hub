import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getAccountDisplayName, getContactDisplayName, getInitial } from '@/utils';
import type { AccountSummary, Contact, ConversationSummary, Group, TagItem } from '@/types';

interface ConversationDetailsPanelProps {
  open: boolean;
  conversation?: ConversationSummary;
  contact?: Contact;
  group?: Group;
  workspaceAccount?: AccountSummary;
  allTags?: TagItem[];
  onAssignTag?: (tagId: string) => void;
  onUnassignTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color: string) => void;
  onDeleteTag?: (tagId: string) => void;
  onSyncTags?: () => void;
  onUpdateNotes?: (notes: string | null) => Promise<void>;
  onClose: () => void;
}

const TAG_COLOR_PALETTE = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#10b981', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

function DetailRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="text-sm text-[#e8ecf8] break-words">{value}</div>
    </div>
  );
}

export function ConversationDetailsPanel({
  open,
  conversation,
  contact,
  group,
  workspaceAccount,
  allTags = [],
  onAssignTag,
  onUnassignTag,
  onCreateTag,
  onDeleteTag,
  onSyncTags,
  onUpdateNotes,
  onClose,
}: ConversationDetailsPanelProps) {
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PALETTE[5]);

  // Keep local note state synced when active conversation changes
  useEffect(() => {
    setNoteText(conversation?.notes ?? '');
  }, [conversation?.id, conversation?.notes]);

  if (!open || !conversation) {
    return null;
  }

  const isGroup = conversation.type === 'group';
  const title = contact ? getContactDisplayName(contact) : group?.displayName ?? conversation.title;
  const avatar = contact?.avatar ?? group?.avatar ?? conversation.avatar;

  const handleSaveNote = async () => {
    if (!onUpdateNotes) return;
    setIsSavingNote(true);
    try {
      await onUpdateNotes(noteText.trim() ? noteText.trim() : null);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCreateTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || !onCreateTag) return;
    onCreateTag(newTagName.trim(), newTagColor);
    setNewTagName('');
  };

  return (
    <aside className="w-[340px] max-w-[38vw] min-w-[300px] border-l border-[var(--border)] bg-[var(--card)] flex flex-col max-lg:w-[320px] max-md:absolute max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-20 max-md:shadow-[-12px_0_40px_rgba(0,0,0,0.2)] transition-colors">
      <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)] truncate">Thông tin hội thoại</div>
          <div className="text-xs text-muted-foreground truncate">{isGroup ? 'Nhóm Zalo' : 'Khách hàng Zalo'}</div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-xs">
          Đóng
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Profile Card */}
        <div className="flex flex-col items-center text-center gap-3">
          <Avatar className="w-16 h-16 rounded-2xl ring-2 ring-[var(--border)]">
            {avatar ? <img src={avatar} alt={title} className="w-full h-full object-cover rounded-2xl" /> : null}
            <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-xl font-extrabold rounded-2xl">
              {getInitial(title)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-base font-bold text-[var(--foreground)] break-words">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{conversation.id}</div>
          </div>
        </div>

        <Separator />

        {/* CUSTOMER NOTES SECTION (Mini-CRM) */}
        <div className="space-y-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <span>📝 Ghi chú khách hàng</span>
            </div>
            {conversation.notesUpdatedAt && (
              <span className="text-[10px] text-amber-700/70 dark:text-amber-300/60 font-medium">
                {new Date(conversation.notesUpdatedAt).toLocaleDateString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
            )}
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Ghi chú về khách hàng (yêu cầu, địa chỉ, ngân sách, nhắc nhở...)"
            rows={3}
            className="w-full text-xs text-[var(--foreground)] bg-[var(--background)] border border-amber-500/30 rounded-lg p-2.5 focus:outline-none focus:border-amber-500 placeholder:text-muted-foreground resize-y leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-muted-foreground truncate max-w-[170px]">
              {conversation.notesUpdatedBy ? `Bởi: ${conversation.notesUpdatedBy}` : 'Chưa có ghi chú'}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleSaveNote}
              disabled={isSavingNote || noteText === (conversation.notes ?? '')}
              className="h-7 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-200 border border-amber-500/40 font-semibold"
            >
              {isSavingNote ? 'Đang lưu...' : 'Lưu ghi chú'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* TAGS & LABELS SECTION */}
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[var(--foreground)] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>🏷️ Nhãn hội thoại</span>
            </span>
            <div className="flex items-center gap-1">
              {onSyncTags && (
                <button
                  type="button"
                  onClick={onSyncTags}
                  className="text-[11px] text-blue-500 hover:text-blue-600 transition-colors p-1 font-medium"
                  title="Đồng bộ nhãn từ Zalo"
                >
                  🔄 Zalo
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsManagingTags(!isManagingTags)}
                className="text-[11px] text-blue-500 hover:text-blue-600 transition-colors p-1 font-medium"
              >
                {isManagingTags ? 'Xong' : 'Quản lý'}
              </button>
            </div>
          </div>

          {/* Current Assigned Tags */}
          <div className="flex flex-wrap gap-1.5">
            {Array.isArray(conversation.labels) && conversation.labels.length > 0 ? (
              conversation.labels.map((lbl) => (
                <span
                  key={lbl.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white shadow-sm border border-white/10"
                  style={{ backgroundColor: lbl.color || '#3b82f6' }}
                >
                  <span>{lbl.emoji ? `${lbl.emoji} ` : ''}{lbl.name}</span>
                  {onUnassignTag && (
                    <button
                      type="button"
                      onClick={() => onUnassignTag(lbl.id)}
                      className="hover:bg-black/20 rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none ml-0.5"
                      title="Gỡ nhãn"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))
            ) : (
              <div className="text-xs text-muted-foreground italic">Chưa gắn nhãn nào</div>
            )}
          </div>

          {/* Quick Assign Tags */}
          {!isManagingTags && allTags.length > 0 && onAssignTag && (
            <div className="pt-1.5">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Gắn thêm nhãn:</div>
              <div className="flex flex-wrap gap-1">
                {allTags
                  .filter((t) => !conversation.labels?.some((cl) => cl.id === t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onAssignTag(t.id)}
                      className="px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 transition-colors flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || '#3b82f6' }} />
                      <span>{t.emoji ? `${t.emoji} ` : ''}{t.name}</span>
                      <span className="text-muted-foreground/80 font-bold">+</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Tag Management Sub-panel */}
          {isManagingTags && (
            <div className="mt-3 p-3 rounded-xl bg-white/4 border border-white/10 space-y-3">
              <div className="text-xs font-semibold text-white/90">Tạo nhãn mới:</div>
              <form onSubmit={handleCreateTagSubmit} className="space-y-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tên nhãn (ví dụ: Cần báo giá, VIP...)"
                  className="w-full text-xs text-[#f1f5f9] bg-black/40 border border-white/10 rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TAG_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`w-5 h-5 rounded-full border ${newTagColor === c ? 'ring-2 ring-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <Button type="submit" size="sm" className="w-full h-7 text-xs mt-1 bg-blue-600 hover:bg-blue-500 text-white">
                  + Thêm nhãn
                </Button>
              </form>

              {allTags.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="text-[11px] text-muted-foreground">Danh sách nhãn hệ thống:</div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {allTags.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded bg-white/5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                          <span className="truncate">{t.name}</span>
                          {t.source === 'zalo' && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1 rounded">Zalo</span>}
                        </div>
                        {onDeleteTag && t.source !== 'zalo' && (
                          <button
                            type="button"
                            onClick={() => onDeleteTag(t.id)}
                            className="text-red-400 hover:text-red-300 text-[11px] px-1"
                            title="Xóa nhãn"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* CONVERSATION INFO */}
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[#eef2ff]">Chi tiết hội thoại</div>
          <div className="space-y-2.5">
            <DetailRow label="Loại hội thoại" value={isGroup ? 'Nhóm Zalo' : 'Cá nhân 1-1'} />
            <DetailRow label="Thread ID" value={conversation.threadId} />
            <DetailRow label="Tin nhắn gần nhất" value={conversation.lastMessageText} />
            <DetailRow label="Số tin nhắn local" value={conversation.messageCount} />
          </div>
        </div>

        {contact && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[#eef2ff]">Thông tin người dùng</div>
              <div className="space-y-2.5">
                <DetailRow label="Tên hiển thị" value={getContactDisplayName(contact)} />
                <DetailRow label="Hub alias" value={contact.hubAlias} />
                <DetailRow label="Zalo alias" value={contact.zaloAlias} />
                <DetailRow label="Tên Zalo" value={contact.zaloName} />
                <DetailRow label="Số điện thoại" value={contact.phoneNumber} />
                <DetailRow label="User ID" value={contact.userId} />
              </div>
            </div>
          </>
        )}

        {group && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[#eef2ff]">Thông tin nhóm</div>
              <div className="space-y-2.5">
                <DetailRow label="Tên nhóm" value={group.displayName} />
                <DetailRow label="Group ID" value={group.groupId} />
                <DetailRow label="Số thành viên" value={group.memberCount} />
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* WORKSPACE INFO */}
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[#eef2ff]">Workspace hiện tại</div>
          <div className="space-y-2.5">
            <DetailRow label="Tài khoản xử lý" value={workspaceAccount ? getAccountDisplayName(workspaceAccount) : undefined} />
            <DetailRow label="Số điện thoại account" value={workspaceAccount?.phoneNumber} />
            <DetailRow label="Account ID" value={workspaceAccount?.accountId} />
          </div>
        </div>
      </div>
    </aside>
  );
}
