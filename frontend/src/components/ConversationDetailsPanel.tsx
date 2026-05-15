import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getAccountDisplayName, getContactDisplayName, getInitial } from '../utils';
import type { AccountSummary, Contact, ConversationSummary, Group } from '../types';

interface ConversationDetailsPanelProps {
  open: boolean;
  conversation?: ConversationSummary;
  contact?: Contact;
  group?: Group;
  workspaceAccount?: AccountSummary;
  onClose: () => void;
}

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
  onClose,
}: ConversationDetailsPanelProps) {
  if (!open || !conversation) {
    return null;
  }

  const isGroup = conversation.type === 'group';
  const title = contact ? getContactDisplayName(contact) : group?.displayName ?? conversation.title;
  const avatar = contact?.avatar ?? group?.avatar ?? conversation.avatar;

  return (
    <aside className="w-[320px] max-w-[36vw] min-w-[280px] border-l border-[var(--border)] bg-[rgba(9,12,18,0.96)] flex flex-col max-lg:w-[300px] max-md:absolute max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-20 max-md:shadow-[-12px_0_40px_rgba(0,0,0,0.35)]">
      <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#eef2ff] truncate">Thông tin hội thoại</div>
          <div className="text-xs text-muted-foreground truncate">{isGroup ? 'Nhóm Zalo' : 'Người dùng Zalo'}</div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-xs">
          Đóng
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        <div className="flex flex-col items-center text-center gap-3">
          <Avatar className="w-20 h-20 rounded-3xl">
            {avatar ? <img src={avatar} alt={title} className="w-full h-full object-cover rounded-3xl" /> : null}
            <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-2xl font-extrabold rounded-3xl">
              {getInitial(title)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-lg font-bold text-[#f3f6ff] break-words">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">{conversation.id}</div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <DetailRow label="Loại hội thoại" value={isGroup ? 'Nhóm' : '1-1'} />
          <DetailRow label="Thread ID" value={conversation.threadId} />
          <DetailRow label="Tin nhắn gần nhất" value={conversation.lastMessageText} />
          <DetailRow label="Số tin nhắn local" value={conversation.messageCount} />
        </div>

        {contact && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#eef2ff]">Thông tin người dùng</div>
              <DetailRow label="Tên hiển thị" value={getContactDisplayName(contact)} />
              <DetailRow label="Hub alias" value={contact.hubAlias} />
              <DetailRow label="Zalo alias" value={contact.zaloAlias} />
              <DetailRow label="Tên Zalo" value={contact.zaloName} />
              <DetailRow label="Số điện thoại" value={contact.phoneNumber} />
              <DetailRow label="User ID" value={contact.userId} />
            </div>
          </>
        )}

        {group && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#eef2ff]">Thông tin nhóm</div>
              <DetailRow label="Tên nhóm" value={group.displayName} />
              <DetailRow label="Group ID" value={group.groupId} />
              <DetailRow label="Số thành viên" value={group.memberCount} />
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-4">
          <div className="text-sm font-semibold text-[#eef2ff]">Workspace hiện tại</div>
          <DetailRow label="Tài khoản xử lý" value={workspaceAccount ? getAccountDisplayName(workspaceAccount) : undefined} />
          <DetailRow label="Số điện thoại account" value={workspaceAccount?.phoneNumber} />
          <DetailRow label="Account ID" value={workspaceAccount?.accountId} />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-sm font-semibold text-[#eef2ff]">Thao tác</div>
          <div className="grid gap-2">
            <Button type="button" variant="secondary" className="justify-start h-9 text-sm" disabled>
              Ghim ghi chú người dùng
            </Button>
            <Button type="button" variant="secondary" className="justify-start h-9 text-sm" disabled>
              Xem lịch sử thao tác
            </Button>
            <Button type="button" variant="secondary" className="justify-start h-9 text-sm" disabled>
              Gắn nhãn hội thoại
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Phần thao tác sẽ được mở rộng tiếp sau khi hoàn tất các flow chat cơ bản.
          </div>
        </div>
      </div>
    </aside>
  );
}
