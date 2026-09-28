import { useEffect, useRef, useState } from 'react';
import { composerRequest } from '../../../api';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { chatSession, parseConversationKey } from '../model/chat-session';
import type { Message } from '../../../types';
import { ensureConversationRecovered } from '../../../stores/composer-store';
import { conversationRecovery } from '../model/conversation-recovery';
import { conversationUnresolved } from '../model/conversation-unresolved';
import { actionRecovery } from '../model/action-recovery';
import { Mic, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './composer.css';

type Receipt = { id: string; action: string; status: string; result?: unknown };
export function ComposerExtendedTools({ scope, messages, addFiles, disabled }: {
  scope: string; messages: Message[]; addFiles: (files: File[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [caps, setCaps] = useState<Record<string, boolean>>({});
  const [category, setCategory] = useState('sticker');
  const [audioShortcut, setAudioShortcut] = useState(false);
  const [capsLoaded, setCapsLoaded] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState('');
  const [stickers, setStickers] = useState<Array<{ id: number; text: string; url?: string }>>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [question, setQuestion] = useState(''), [options, setOptions] = useState('');
  const [messageId, setMessageId] = useState(''), [target, setTarget] = useState('');
  const [title, setTitle] = useState(''), [date, setDate] = useState(''), [topicId, setTopicId] = useState(''), [userId, setUserId] = useState('');
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const active = useRef(scope); active.current = scope;
  const lock = useRef(false);
  const call = <T,>(path: string, body?: unknown) => {
    const [user, account, conversation] = parseConversationKey(scope);
    const identity = chatSession.capture();
    if (identity.userId !== user) return Promise.reject(new Error('Phiên đăng nhập đã thay đổi.'));
    return composerRequest<T>(account, conversation, `/tools${path}`, { signal: AbortSignal.timeout(20_000),
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }, identity);
  };
  useEffect(() => {
    setOpen(false); setCaps({}); setCapsLoaded(false); setReceipts([]); setStickers([]); setError(''); setMessageId(''); setTarget('');
    return () => { if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); };
  }, [scope]);
  useEffect(() => chatSession.subscribe(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop()); setOpen(false); setRecording(false);
  }), []);
  useEffect(() => { if (!open || !scope) return; let live = true;
    void Promise.all([call<Record<string, boolean>>('/capabilities'), call<{ actions: Receipt[] }>('/actions')])
      .then(([c, r]) => { if (live) {
        const local: Receipt[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(`composer-action:${scope}:`)) {
            try { const v = JSON.parse(localStorage.getItem(k)!); if (!r.actions.some(a => a.id === v.id)) local.push({ ...v, status: 'unknown' }); } catch { /* invalid local metadata */ }
          }
        }
        actionRecovery.merge(scope, [...local, ...r.actions]);
         setCaps(c); setCapsLoaded(true); setReceipts(actionRecovery.get(scope));
      } }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [open, scope]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { if (active.current === scope) setError(String(e)); }
    finally { lock.current = false; if (active.current === scope) setBusy(false); }
  };
  const send = (action: string, payload: Record<string, unknown>) => run(async () => {
    const session = chatSession.capture();
    await ensureConversationRecovered(scope);
    // Hydration may have replaced the local map while the modal's server read completed.
    actionRecovery.merge(scope, receipts);
    if (!chatSession.valid(session) || !conversationRecovery.ready(scope) || conversationUnresolved(scope)) throw new Error('Hội thoại chưa khôi phục hoặc còn lượt gửi chưa xác nhận. Kiểm tra kết quả cũ trước.');
    const id = crypto.randomUUID();
    // Persist an identity before POST. Lost responses are queried, never posted with a new ID.
    const key = `composer-action:${scope}:${id}`;
    localStorage.setItem(key, JSON.stringify({ id, action }));
    const pending = { id, action, status: 'unknown' };
    actionRecovery.merge(scope, [pending]);
    setReceipts(r => [pending, ...r]);
    let receipt: Receipt;
    try { receipt = await call<Receipt>('/actions', { id, action, ...payload }); }
    catch (e) {
      // Neither a timeout nor GET404 proves that a delayed reservation cannot arrive.
      // Keep the identity until explicit atomic recovery seals/reads it.
      throw e;
    }
    if (active.current === scope) setReceipts(r => [receipt, ...r.filter(x => x.id !== id)]);
    actionRecovery.merge(scope, [receipt]);
    if (['accepted', 'rejected'].includes(receipt.status)) localStorage.removeItem(key);
  });
  const record = () => run(async () => {
    const captured = scope, identity = chatSession.capture();
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (active.current !== captured || !chatSession.valid(identity)) { media.getTracks().forEach(t => t.stop()); return; }
    stream.current = media;
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    let r: MediaRecorder;
    try { r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined); }
    catch (e) { media.getTracks().forEach(t => t.stop()); throw e; }
    recorder.current = r;
    const chunks: Blob[] = []; let size = 0;
    r.ondataavailable = e => { chunks.push(e.data); size += e.data.size; if (size > 20 * 1024 * 1024 && r.state === 'recording') r.stop(); };
    const timer = setTimeout(() => { if (r.state === 'recording') r.stop(); }, 120_000);
    r.onstop = () => {
      clearTimeout(timer); media.getTracks().forEach(t => t.stop());
      if (active.current !== captured || !chatSession.valid(identity)) return;
      setRecording(false);
      const type = r.mimeType || 'application/octet-stream';
      const blob = new Blob(chunks, { type });
      if (blob.size) addFiles([new File([blob], `recording-${Date.now()}.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { type })]);
    };
    r.start(1000); setRecording(true);
  });
  const blocked = busy || receipts.some(r => r.status === 'unknown');
  const available: Record<string, boolean> = {
    sticker: Boolean(caps.sticker), poll: Boolean(caps.poll), messages: Boolean(caps.forward || caps.undo),
    reminder: Boolean(caps.reminder || caps.editReminder), contact: Boolean(caps.contact),
    audio: Boolean(caps.audioFile && typeof MediaRecorder !== 'undefined'),
  };
  // The mic shortcut never silently redirects to an unrelated sending tool.
  const selectedCategory = audioShortcut ? 'audio' : available[category] ? category : Object.keys(available).find(key => available[key]);
  return <>
    <Button type="button" variant="ghost" size="icon-lg" className="order-4 rounded-xl" aria-label="Ghi âm thành tệp" title="Ghi âm thành tệp" disabled={disabled || !scope} onClick={e => { trigger.current = e.currentTarget; setAudioShortcut(true); setCategory('audio'); setOpen(true); }}><Mic /></Button>
    <Button type="button" variant="ghost" size="icon-lg" className="order-6 rounded-xl" aria-label="Công cụ khác" title="Công cụ khác" disabled={disabled || !scope} onClick={e => { trigger.current = e.currentTarget; setAudioShortcut(false); setCategory('sticker'); setOpen(true); }}><MoreHorizontal /></Button>
    <Dialog open={open} onOpenChange={value => { if (!value && recorder.current?.state === 'recording') recorder.current.stop(); setOpen(value); }}><DialogContent onCloseAutoFocus={e => { e.preventDefault(); trigger.current?.focus(); }} className="composer-tools max-h-[85dvh] overflow-y-auto rounded-2xl p-4 sm:p-6 motion-reduce:animate-none">
      <DialogTitle>Công cụ gửi</DialogTitle>
      <DialogDescription>Không tự gửi lại khi kết quả chưa rõ. Ghi âm gửi dưới dạng tệp, không phải tin thoại Zalo.</DialogDescription>
      <nav aria-label="Nhóm công cụ" className="flex flex-wrap gap-2">{[['sticker', 'Sticker'], ['poll', 'Bình chọn'], ['messages', 'Tin nhắn'], ['reminder', 'Nhắc hẹn'], ['contact', 'Danh thiếp'], ['audio', 'Âm thanh']].map(([key, label]) => <button type="button" key={key} disabled={!available[key]} aria-pressed={selectedCategory === key} className={selectedCategory === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'} onClick={() => { setAudioShortcut(false); setCategory(key); }}>{label}</button>)}</nav>
      {!capsLoaded && !error && <p role="status">Đang tải công cụ…</p>}
      {capsLoaded && (!selectedCategory || !available[selectedCategory]) && <p role="status" className="text-sm text-muted-foreground">Công cụ này chưa khả dụng trong hội thoại hoặc trình duyệt hiện tại.</p>}
      <div className="composer-tool-category" data-category={selectedCategory}>
      {error && <p role="alert">{error}</p>}
      {selectedCategory === 'sticker' && caps.sticker && <section><h3>Sticker</h3><input aria-label="Tìm sticker" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" disabled={busy || !query.trim()} onClick={() => run(async () => { if (!query.trim()) throw new Error('Nhập từ khóa sticker.'); const r = await call<{ stickers: typeof stickers }>(`/stickers?q=${encodeURIComponent(query.trim())}`); if (active.current === scope) setStickers(r.stickers); })}>Tìm</button>
        <div className="flex flex-wrap gap-2">{stickers.map(s => <button type="button" key={s.id} disabled={blocked} title={s.text || String(s.id)} onClick={() => send('sticker', { stickerId: s.id })}>
          {s.url ? <img className="w-16 h-16 object-contain" src={s.url} referrerPolicy="no-referrer" alt={s.text || `Sticker ${s.id}`} /> : `Sticker ${s.id}`}</button>)}</div></section>}
      {selectedCategory === 'poll' && caps.poll && <section><h3>Bình chọn nhóm</h3><input aria-label="Câu hỏi" value={question} onChange={e => setQuestion(e.target.value)} /><textarea aria-label="Lựa chọn mỗi dòng" value={options} onChange={e => setOptions(e.target.value)} placeholder="Mỗi lựa chọn một dòng" />
        <button type="button" disabled={blocked} onClick={() => send('poll', { question, options: options.split('\n').filter(Boolean) })}>Tạo bình chọn</button></section>}
      {selectedCategory === 'messages' && (caps.forward || caps.undo) && <section><h3>Tin nhắn</h3><select aria-label="Chọn tin nhắn" value={messageId} onChange={e => setMessageId(e.target.value)}><option value="">Chọn tin nhắn</option>{messages.filter(m => !m.id.startsWith('pending:')).map(m => <option key={m.id} value={m.id}>{(m.text || m.kind).slice(0, 80)}</option>)}</select>
        {caps.forward && <><label className="text-sm">Mã hội thoại nhận<p className="text-xs text-muted-foreground">Nhập direct:mã-người-dùng hoặc group:mã-nhóm. Chưa hỗ trợ tìm người nhận tại đây.</p><input aria-label="Đích chuyển tiếp" placeholder="direct:… hoặc group:…" value={target} onChange={e => setTarget(e.target.value)} /></label><button type="button" disabled={blocked || !messageId} onClick={() => send('forward', { messageId, target })}>Chuyển tiếp văn bản</button></>}
        {caps.undo && <button type="button" disabled={blocked || !messageId} onClick={() => { if (confirm('Thu hồi tin nhắn của bạn?')) void send('undo', { messageId }); }}>Thu hồi tin của tôi</button>}</section>}
      {selectedCategory === 'reminder' && (caps.reminder || caps.editReminder) && <section><h3>Nhắc hẹn</h3><input aria-label="Tiêu đề nhắc hẹn" value={title} onChange={e => setTitle(e.target.value)} /><input aria-label="Thời gian nhắc hẹn" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
        {caps.reminder && <button type="button" disabled={blocked} onClick={() => send('reminder', { title, startTime: new Date(date).getTime() })}>Tạo nhắc hẹn</button>}
        {caps.editReminder && <><input aria-label="ID nhắc hẹn" placeholder="Topic ID cần sửa" value={topicId} onChange={e => setTopicId(e.target.value)} /><button type="button" disabled={blocked} onClick={() => send('editReminder', { topicId, title, startTime: new Date(date).getTime() })}>Sửa nhắc hẹn</button></>}</section>}
      {selectedCategory === 'contact' && caps.contact && <section><h3>Danh thiếp</h3><input aria-label="Zalo user ID" value={userId} onChange={e => setUserId(e.target.value)} /><button type="button" disabled={blocked} onClick={() => send('contact', { userId })}>Gửi danh thiếp</button></section>}
      {selectedCategory === 'audio' && available.audio && <section><button type="button" disabled={busy || disabled} onClick={() => recording ? recorder.current?.stop() : record()}>{recording ? 'Dừng và đính kèm tệp âm thanh' : 'Ghi âm thành tệp (tối đa 2 phút)'}</button><p className="text-xs">Tệp được thêm vào bản nháp. Chọn Chuẩn bị tệp, kiểm tra rồi bấm Gửi. Đây không phải tin thoại Zalo.</p></section>}
      </div>
      <p className="text-xs">Vị trí và tin thoại Zalo: chưa hỗ trợ.</p>
      <details className="text-sm"><summary className="min-h-10 cursor-pointer py-2">Kết quả gần đây ({receipts.length}){receipts.some(r => r.status === 'unknown') ? ' · Có lượt chưa rõ kết quả' : ''}</summary>{receipts.map(r => <div key={r.id} className="text-xs border-t py-2 space-y-2">{({ sticker: 'Sticker', poll: 'Bình chọn', forward: 'Chuyển tiếp', undo: 'Thu hồi', reminder: 'Nhắc hẹn', editReminder: 'Sửa nhắc hẹn', contact: 'Danh thiếp' } as Record<string, string>)[r.action] || 'Thao tác'}: {r.status === 'rejected' ? 'Không gửi — có thể tạo lượt mới' : r.status === 'accepted' ? 'Zalo đã tiếp nhận (chưa xác nhận đã đọc)' : 'Chưa rõ kết quả — không gửi lại'}
        <button type="button" disabled={busy} onClick={() => run(async () => { const v = await call<Receipt>(`/actions/${r.id}`); actionRecovery.merge(scope, [v]); if (active.current === scope) setReceipts(actionRecovery.get(scope)); })}>Kiểm tra</button>
        <button type="button" disabled={busy} onClick={() => run(async () => { const v = await call<Receipt>(`/actions/${r.id}/recover`, {}); actionRecovery.merge(scope, [v]); if (['accepted', 'rejected'].includes(v.status)) localStorage.removeItem(`composer-action:${scope}:${r.id}`); if (active.current === scope) setReceipts(actionRecovery.get(scope)); })}>Khôi phục kết quả (không gửi lại)</button></div>)}</details>
    </DialogContent></Dialog>
  </>;
}
