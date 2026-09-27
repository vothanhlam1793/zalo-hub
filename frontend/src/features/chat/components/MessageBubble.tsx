import React, { memo, useState } from 'react';
import { formatTime, getInitial } from '@/utils';
import type { Message, MessageMention, MessageReactionOption } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageDeliveryStatus, type DeliveryActions } from './messages/MessageDeliveryStatus';
import { MessageMedia } from './messages/MessageMedia';
import { RichMessageContent } from './messages/RichMessageContent';
import { messageCaption, messagePreview } from '../model/message-preview';

const REACTION_OPTIONS: MessageReactionOption[] = [
  { emoji: '❤️', icon: '/-heart' }, { emoji: '👍', icon: '/-strong' },
  { emoji: '😆', icon: ':>' }, { emoji: '😮', icon: ':o' },
  { emoji: '😢', icon: ':-((' }, { emoji: '😡', icon: ':-h' },
];

export interface MessageGroupItem {
  msg: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showDateDivider?: string;
}

interface MessageBubbleProps extends DeliveryActions {
  msg: Message;
  isGroup: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  senderAvatar?: string;
  onReact?: (message: Message, reaction: MessageReactionOption) => void;
  onReply?: (message: Message) => void;
  onOpenLightbox?: (attachmentKey: string) => void;
}

export function renderMessageText(text: string, mentions?: MessageMention[]) {
  if (!mentions?.length) return text;
  const result: React.ReactNode[] = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((a, b) => a.pos - b.pos)) {
    if (!Number.isInteger(mention.pos) || !Number.isInteger(mention.len) || mention.pos < cursor || mention.len <= 0 || mention.pos + mention.len > text.length) continue;
    result.push(text.slice(cursor, mention.pos));
    result.push(<span key={`${mention.pos}:${mention.uid}`} className="font-semibold text-blue-500 bg-blue-500/10 rounded px-1">{text.slice(mention.pos, mention.pos + mention.len)}</span>);
    cursor = mention.pos + mention.len;
  }
  result.push(text.slice(cursor));
  return result;
}

export const MessageBubble = memo(function MessageBubble({
  msg, isGroup, isFirstInGroup = true, isLastInGroup = true, senderAvatar,
  onReact, onReply, onOpenLightbox, onRetryMessage, onQueryMessage, onCancelMessage, onRestoreDraft,
}: MessageBubbleProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const receivedReactions = (msg.reactions ?? []).filter(reaction => Number.isFinite(reaction.count) && reaction.count > 0);
  const isOutgoing = msg.direction === 'outgoing' || msg.isSelf;
  const compact = msg.kind === 'system' || msg.kind === 'reaction';
  const rich = ['call', 'system', 'reaction', 'poll', 'unknown', 'location', 'link', 'card'].includes(msg.kind);
  const caption = messageCaption(msg);
  const canReact = Boolean(onReact && msg.providerMessageId && (!msg.delivery || msg.delivery === 'sent') && msg.kind !== 'reaction');
  const avatarUrl = senderAvatar || msg.senderAvatar;
  const roundedClass = isOutgoing
    ? `rounded-2xl ${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-md'} ${isLastInGroup ? 'rounded-br-sm' : 'rounded-br-md'}`
    : `rounded-2xl ${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-md'} ${isLastInGroup ? 'rounded-bl-sm' : 'rounded-bl-md'}`;

  return <div className={`flex items-start gap-2 ${compact ? 'justify-center' : isOutgoing ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-2.5' : 'mt-0.5'}`}>
    {!compact && isGroup && !isOutgoing && <div className="w-8 shrink-0 pt-0.5">
      {isFirstInGroup && <Avatar className="h-7 w-7 text-[11px]">
        {avatarUrl && <img src={avatarUrl} alt={msg.senderName || 'Thành viên'} className="h-full w-full rounded-full object-cover" />}
        <AvatarFallback>{getInitial(msg.senderName || 'Thành viên')}</AvatarFallback>
      </Avatar>}
    </div>}
    <div className="min-w-0 max-w-[85%] sm:max-w-[500px] flex flex-col items-start">
      {!compact && isGroup && !isOutgoing && isFirstInGroup && msg.senderName && <div className="mb-1 pl-1 text-[11px] font-semibold text-blue-500">{msg.senderName}</div>}
      <div className={`group relative hover:z-20 focus-within:z-20 min-w-0 max-w-full break-words ${compact ? 'rounded-xl bg-[var(--muted)] px-3 py-1.5' : `px-3.5 py-2.5 text-sm leading-relaxed shadow-xs ${roundedClass} ${isOutgoing
        ? 'bg-[var(--bubble-out-bg)] border border-[var(--bubble-out-border)] text-[var(--bubble-out-text)]'
        : 'bg-[var(--bubble-in-bg)] border border-[var(--bubble-in-border)] text-[var(--bubble-in-text)]'}`}`}>
        {msg.quote && <div className="mb-2 rounded-xl border border-current/20 bg-black/5 px-3 py-2 text-xs">
          <div className="truncate font-bold">{msg.quote.senderName ?? msg.quote.senderId ?? 'Tin nhắn gốc'}</div>
          <div className="mt-0.5 truncate opacity-85">{messagePreview({ kind: msg.quote.kind ?? 'text', text: msg.quote.text ?? '' })}</div>
        </div>}
        {rich && <RichMessageContent message={msg} />}
        <MessageMedia message={msg} onOpenLightbox={onOpenLightbox} />
        {!rich && caption && <div className={`whitespace-pre-wrap select-text ${msg.kind !== 'text' || msg.attachments.length ? 'mt-2' : ''}`}>{renderMessageText(caption, msg.mentions)}</div>}
        {receivedReactions.length > 0 && <div aria-label="Cảm xúc đã nhận" title={receivedReactions.map(reaction => `${reaction.emoji}: ${reaction.count}`).join(' · ')} className="absolute -bottom-1.5 left-1 z-10 flex max-w-[calc(100vw-6rem)] flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card)] px-1.5 py-px text-[11px] leading-4 text-[var(--foreground)] shadow-sm">
          {receivedReactions.slice(0, 3).map((reaction, index) =>
            <span key={`${reaction.emoji}:${index}`} aria-label={`${reaction.emoji}: ${reaction.count}`} className="shrink-0">{reaction.emoji} {reaction.count}</span>)}
          {receivedReactions.length > 3 && <span className="shrink-0">+{receivedReactions.length - 3}</span>}
        </div>}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="text-[10px] opacity-60">{formatTime(msg.timestamp)}</span>
          {isOutgoing && <MessageDeliveryStatus message={msg} onRetryMessage={onRetryMessage} onQueryMessage={onQueryMessage} onCancelMessage={onCancelMessage} onRestoreDraft={onRestoreDraft} />}
        </div>
        {(canReact || onReply) && <div className={`absolute bottom-0 z-30 ${isOutgoing ? 'right-0' : 'left-0'}`}>
          <button type="button" aria-label="Thao tác tin nhắn" aria-expanded={actionsOpen} onClick={() => setActionsOpen(open => !open)} className={`absolute bottom-6 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] shadow-sm sm:hidden ${isOutgoing ? 'right-0' : 'left-0'}`}>⋯</button>
          <div className={`absolute top-0 w-max max-w-[calc(100vw-5rem)] pt-1 ${actionsOpen ? 'visible pointer-events-auto opacity-100' : 'invisible pointer-events-none opacity-0'} sm:invisible sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:group-hover:visible sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:visible sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 ${isOutgoing ? 'right-0' : 'left-0'}`}>
          <div className="flex flex-wrap items-center justify-end gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--foreground)] shadow-lg">
          {onReply && <button type="button" className="rounded px-2 py-1 text-xs hover:bg-black/10 focus-visible:outline-2" onClick={() => { setActionsOpen(false); onReply(msg); }} title="Trả lời tin nhắn này">↩ Trả lời</button>}
          {canReact && REACTION_OPTIONS.map(reaction => <button key={reaction.emoji} type="button" className="rounded px-1.5 py-1 text-sm hover:bg-black/10 focus-visible:outline-2"
            onClick={() => { setActionsOpen(false); onReact?.(msg, reaction); }} title={`Thả cảm xúc ${reaction.emoji}`} aria-label={`Thả cảm xúc ${reaction.emoji}`}>{reaction.emoji}</button>)}
          </div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
});
