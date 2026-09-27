import React, { useState } from 'react';
import type { Message, MessageReactionOption } from '@/types';
import { formatTime } from '@/utils';
import type { AlbumRow } from '../../model/album-selector';
import { messageCaption, messagePreview } from '../../model/message-preview';
import { attachmentSource, SafeImage } from './MessageMedia';
import { MessageDeliveryStatus, type DeliveryActions } from './MessageDeliveryStatus';
import { renderMessageText } from '../MessageBubble';

const reactions: MessageReactionOption[] = [
  { emoji: '❤️', icon: '/-heart' }, { emoji: '👍', icon: '/-strong' },
  { emoji: '😆', icon: ':>' }, { emoji: '😮', icon: ':o' },
  { emoji: '😢', icon: ':-((' }, { emoji: '😡', icon: ':-h' },
];
interface Props extends DeliveryActions {
  row: AlbumRow;
  isGroup: boolean;
  hasMoreHistory: boolean;
  onReply?: (message: Message) => void;
  onReact?: (message: Message, reaction: MessageReactionOption) => void;
  onOpenLightbox?: (key: string) => void;
}

function ItemActions({ message, onReply, onReact }: Pick<Props, 'onReply' | 'onReact'> & { message: Message }) {
  const [open, setOpen] = useState(false);
  const canReact = onReact && message.providerMessageId && (!message.delivery || message.delivery === 'sent');
  return <div className="absolute right-1 top-1 z-20" data-action-message={message.id}>
    <button type="button" aria-label="Thao tác ảnh" aria-expanded={open} onClick={() => setOpen(!open)}
      className="h-8 w-8 rounded-full bg-black/75 text-white focus-visible:outline-2">⋯</button>
    {open && <div className="absolute right-0 top-9 flex w-44 flex-wrap rounded-lg border bg-[var(--card)] p-1 text-[var(--foreground)] shadow-lg">
      {onReply && <button type="button" className="w-full p-2 text-left text-xs" onClick={() => { setOpen(false); onReply(message); }}>↩ Trả lời</button>}
      {canReact && reactions.map(reaction => <button type="button" key={reaction.icon} aria-label={`Thả cảm xúc ${reaction.emoji}`}
        className="h-10 w-10" onClick={() => { setOpen(false); onReact(message, reaction); }}>{reaction.emoji}</button>)}
    </div>}
  </div>;
}

export function AlbumMessage({ row, isGroup, hasMoreHistory, onReply, onReact, onOpenLightbox, ...delivery }: Props) {
  const first = row.messages[0];
  const outgoing = first.direction === 'outgoing' || first.isSelf;
  const visible = row.media.slice(0, 4);
  const partial = row.total !== undefined && row.total > row.media.length;
  return <div className={`my-2 flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
    <section aria-label="Album ảnh" className={`min-w-0 w-[360px] max-w-[90%] rounded-2xl border p-2 text-sm ${outgoing
      ? 'bg-[var(--bubble-out-bg)] border-[var(--bubble-out-border)] text-[var(--bubble-out-text)]'
      : 'bg-[var(--bubble-in-bg)] border-[var(--bubble-in-border)] text-[var(--bubble-in-text)]'}`}>
      {isGroup && !outgoing && <div className="mb-1 text-xs font-semibold">{first.senderName || first.senderId}</div>}
      <div data-album-grid={visible.length} className="grid grid-cols-2 gap-1" style={{ aspectRatio: visible.length === 2 ? '2 / 1' : '1 / 1', gridTemplateRows: visible.length >= 3 ? '1fr 1fr' : '1fr' }}>
        {visible.map((item, index) => <div key={item.key} data-album-item={item.key} data-content-anchor={`media:${item.key}`}
          className={`relative min-h-0 min-w-0 rounded-lg bg-black/10 focus-within:z-30 ${visible.length === 3 && index === 0 ? 'row-span-2' : ''} ${visible.length === 1 ? 'col-span-2' : ''}`}>
          <button type="button" aria-label={`Xem ảnh ${index + 1}`} className="block h-full w-full overflow-hidden rounded-lg focus-visible:outline-2"
            onClick={() => onOpenLightbox?.(item.key)}>
            <SafeImage src={attachmentSource(item.message, item.attachment, item.index)} source="local-preview" alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" />
            {index === 3 && row.media.length > 4 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-3xl font-semibold text-white">+{row.media.length - 4}</span>}
          </button>
          <ItemActions message={item.message} onReply={onReply} onReact={onReact} />
        </div>)}
      </div>
      {row.media.length > 4 && <details className="mt-2 text-xs"><summary className="cursor-pointer p-1">Thao tác {row.media.length - 4} ảnh còn lại</summary>
        {row.media.slice(4).map((item, index) => <div key={item.key} className="relative h-11 pr-10">
          <button type="button" className="p-2 underline" onClick={() => onOpenLightbox?.(item.key)}>Xem ảnh {index + 5}</button>
          <ItemActions message={item.message} onReply={onReply} onReact={onReact} />
        </div>)}
      </details>}
      {row.messages.map(message => <div key={message.localId || message.id} data-album-message-id={message.localId || message.id}>
        {message.quote && <blockquote className="my-1 border-l-2 pl-2 text-xs">{message.quote.senderName || message.quote.senderId}: {messagePreview({ kind: message.quote.kind || 'text', text: message.quote.text || '' })}</blockquote>}
        {messageCaption(message) && <div data-content-anchor={`caption:${message.localId || message.id}`} className="mt-1 whitespace-pre-wrap break-words">{renderMessageText(messageCaption(message), message.mentions)}</div>}
        <div className="flex flex-wrap items-center gap-1 text-xs" data-status-message={message.id}>
          {message.reactions?.filter(r => r.count > 0).map((r, index) => <span key={index} aria-label={`${r.emoji}: ${r.count}`}>{r.emoji} {r.count}</span>)}
          {(message.direction === 'outgoing' || message.isSelf) && <MessageDeliveryStatus message={message} {...delivery} />}
        </div>
      </div>)}
      <div className="mt-1 flex justify-between gap-2 text-[11px] opacity-75"><span>{row.media.length} ảnh đã tải{row.total !== undefined ? ` / ${row.total}` : ''}</span><time>{formatTime(first.timestamp)}</time></div>
      {partial && <p className="mt-1 text-xs">Album chưa đầy đủ.{hasMoreHistory ? ' Kéo lên để tải thêm lịch sử.' : ' Các ảnh còn lại chưa có trong lịch sử đã tải.'}</p>}
    </section>
  </div>;
}
