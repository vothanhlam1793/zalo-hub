import { useEffect, useState, type RefObject } from 'react';
import { clientDb } from '../../../lib/client-db';
import { useComposerStore } from '../../../stores/composer-store';
import { chatSession } from '../model/chat-session';
import { Smile, MessageSquareText } from 'lucide-react';
import { ComposerPopover } from './ComposerPopover';

export function ComposerLocalTools({ scope, textareaRef, disabled, kind = 'emoji' }: { scope: string; textareaRef?: RefObject<HTMLTextAreaElement | null>; disabled: boolean; kind?: 'emoji' | 'templates' }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; setReplies([]); setOpen(false); setError('');
    if (scope) void clientDb.getQuickReplies(scope).then(items => { if (live) setReplies(items); });
    return () => { live = false; };
  }, [scope]);
  const insert = (value: string) => {
    const store = useComposerStore.getState(); if (disabled || store.activeKey !== scope) return;
    const input = textareaRef?.current;
    const start = input?.selectionStart ?? store.text.length, end = input?.selectionEnd ?? start;
    const mentions = store.mentions?.filter(item => item.pos + item.len <= start || item.pos >= end)
      .map(item => item.pos >= end ? { ...item, pos: item.pos + value.length - (end - start) } : item);
    store.updateDraft(scope, { text: store.text.slice(0, start) + value + store.text.slice(end), mentions });
    requestAnimationFrame(() => { input?.setSelectionRange(start + value.length, start + value.length); });
  };
  const save = async (items: string[]) => { const session = chatSession.capture();
    if (await clientDb.saveQuickReplies(scope, items)) { if (chatSession.valid(session)) setReplies(items); }
    else setError('Không lưu được mẫu trên thiết bị.');
  };
  return <ComposerPopover label={kind === 'emoji' ? 'Biểu tượng cảm xúc' : 'Mẫu trả lời'} icon={kind === 'emoji' ? <Smile /> : <MessageSquareText />} disabled={disabled} open={open} onOpenChange={setOpen}>
    {kind === 'emoji' ? <div aria-label="Emoji" className="grid grid-cols-4">{['😀', '😊', '❤️', '👍', '🙏', '🎉', '✅', '📦'].map(emoji => <button type="button" key={emoji} aria-label={`Chèn ${emoji}`} className="min-h-10 rounded-lg p-2 text-lg hover:bg-accent" onClick={() => insert(emoji)}>{emoji}</button>)}</div> : <div className="space-y-2 text-xs [&_button]:min-h-10">
      <p>Mẫu riêng trên thiết bị, trong hội thoại này.</p>
      {replies.map((reply, index) => <div key={index} className="flex gap-2"><button type="button" className="p-2 text-left truncate flex-1" onClick={() => insert(reply)}>{reply}</button><button type="button" aria-label={`Xóa mẫu ${index + 1}`} className="p-2" onClick={() => void save(replies.filter((_, i) => i !== index))}>✕</button></div>)}
      <button type="button" className="p-2 underline" onClick={() => { const text = useComposerStore.getState().text.trim(); if (text && replies.length < 30) void save([...replies, text.slice(0, 20000)]); }}>Lưu nội dung hiện tại làm mẫu (tối đa 30)</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </ComposerPopover>;
}
