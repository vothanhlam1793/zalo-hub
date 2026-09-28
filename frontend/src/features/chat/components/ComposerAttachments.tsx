import { useEffect, useState, useRef } from 'react';
import { File, LoaderCircle, X } from 'lucide-react';
import { useComposerStore } from '../../../stores/composer-store';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { createLocalMediaPreview, revokeLocalMediaPreview } from '../model/local-media-preview';
import { batchActions, type ComposerCapabilities, type DraftAttachment } from '../model/composer-types';
import { abandonComposerFailures, archiveComposerBatch, addComposerFiles, getComposerCapabilities, pollComposerBatch, queryComposerBatch, removeComposerFile, sendComposerBatch, stageComposer } from '../model/composer-controller';

export function useAttachmentInput(key: string) {
  const [caps, setCaps] = useState<ComposerCapabilities>();
  const [error, setError] = useState('');
  useEffect(() => { let live = true; setCaps(undefined); setError('');
    if (key) void getComposerCapabilities(key).then(value => { if (live) setCaps(value); }).catch(() => { if (live) setError('Không tải được khả năng đính kèm.'); });
    return () => { live = false; };
  }, [key]);
  return { error, add: (files: File[]) => {
    try { if (!caps?.staging || !caps.batch) throw new Error('Đính kèm chưa sẵn sàng.'); addComposerFiles(key, files, caps); setError(''); }
    catch (error) { setError(String(error)); }
  } };
}
function AttachmentThumbnail({ item }: { item: DraftAttachment }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!item.file || !item.type.startsWith('image/')) return;
    const value = createLocalMediaPreview(item.file); setUrl(value);
    return () => revokeLocalMediaPreview(value);
  }, [item.file, item.type]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <File className="size-6 text-muted-foreground" />;
}
export function ComposerAttachments({ scope }: { scope: string }) {
  const attachments = useComposerStore(s => s.attachments);
  const batch = useComposerStore(s => s.batch);
  const outbox = useComposerStore(s => s.outbox);
  const recovered = useComposerStore(s => s.recoveredDrafts);
  const warning = useComposerStore(s => s.storageWarning);
  const [preview, setPreview] = useState<DraftAttachment>();
  const [url, setUrl] = useState('');
  const [working, setWorking] = useState(false);
  const [crop, setCrop] = useState(100);
  const [error, setError] = useState('');
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const selected = attachments.find(item => item.id === preview?.id);
  const selectedIndex = selected ? attachments.indexOf(selected) : -1;
  const results = [...(batch?.result?.items || []), ...(outbox || []).flatMap(entry => entry.batch.result?.items || [])];
  const unknownCount = results.filter(item => item.status === 'unknown').length;
  const failedCount = results.filter(item => item.status === 'failed').length;
  useEffect(() => { setPreview(undefined); setError(''); if (scope && useComposerStore.getState().drafts[scope]?.batch) pollComposerBatch(scope); }, [scope, Boolean(batch)]);
  useEffect(() => { if (!preview?.file) { setUrl(''); return; }
    const value = createLocalMediaPreview(preview.file); setUrl(value); return () => revokeLocalMediaPreview(value);
  }, [preview]);
  const change = (items: DraftAttachment[]) => useComposerStore.getState().updateDraft(scope, { attachments: items });
  const move = (from: number, to: number) => { if (batch || to < 0 || to >= attachments.length) return;
    const items = [...attachments]; const [item] = items.splice(from, 1); items.splice(to, 0, item); change(items); };
  const action = async (fn: () => Promise<void>) => { setWorking(true); setError(''); try { await fn(); } catch (error) { setError(String(error)); } finally { setWorking(false); } };
  const editImage = async (rotate: boolean) => {
    if (!preview?.file || batch) return;
    const source = preview;
    const bitmap = await createImageBitmap(source.file!);
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Ảnh quá lớn để chỉnh sửa an toàn (40 MP).');
      const ratio = rotate ? 1 : crop / 100;
      const width = Math.max(1, Math.round(bitmap.width * ratio)), height = Math.max(1, Math.round(bitmap.height * ratio));
      const canvas = document.createElement('canvas'); canvas.width = rotate ? height : width; canvas.height = rotate ? width : height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Không hỗ trợ canvas.');
      if (rotate) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
      context.drawImage(bitmap, (bitmap.width - width) / 2, (bitmap.height - height) / 2, width, height, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Không xuất được ảnh.')), 'image/png'));
      if (useComposerStore.getState().activeKey !== scope || useComposerStore.getState().batch) return;
      // Edited bytes always get a new stage and identity; never mutate a staged object.
      await removeComposerFile(scope, source.id);
      const item: DraftAttachment = { ...source, id: crypto.randomUUID(), file: blob, name: source.name.replace(/\.[^.]+$/, '') + '-edited.png', type: 'image/png', size: blob.size, stage: undefined, upload: 'local' };
      const current = useComposerStore.getState().drafts[scope]?.attachments || [];
      change([...current, item]); setPreview(item); setCrop(100);
    } finally { bitmap.close(); }
  };
  return <>
    {warning && <p role="status" className="text-xs text-amber-600">{warning}</p>}
    {recovered?.map((saved, index) => <details key={index} className="text-xs border rounded p-2">
      <summary>Nội dung cũ đã khôi phục {index + 1} (giữ nguyên tag/trả lời)</summary>
      <p className="whitespace-pre-wrap">{saved.text}</p>
      <button type="button" onClick={() => {
        if (!confirm('Thay nội dung đang soạn bằng nội dung đã khôi phục?')) return;
        useComposerStore.getState().updateDraft(scope, { text: saved.text, mentions: saved.mentions, replyingTo: saved.replyingTo,
          recoveredDrafts: recovered.filter((_, i) => i !== index) });
      }}>Khôi phục nội dung và tag</button>
    </details>)}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {attachments.length > 0 && <section aria-label="Tệp đính kèm" className="min-w-0 rounded-xl border bg-muted/30 p-2 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--foreground)]">{attachments.length} tệp đính kèm {attachments.some(item => item.upload === 'uploading') ? '· Đang chuẩn bị…' : '· Đã sẵn sàng'}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
      {attachments.map((item, index) => <div key={item.id} draggable={!batch} onDragStart={event => event.dataTransfer.setData('application/x-composer-index', String(index))}
        onDragOver={event => event.preventDefault()} onDrop={event => { const from = event.dataTransfer.getData('application/x-composer-index'); if (from !== '') { event.preventDefault(); event.stopPropagation(); move(Number(from), index); } }}
        className="relative w-20 shrink-0">
        <button type="button" aria-label={`${index + 1}. ${item.name}`} className="block w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={e => { previewTrigger.current = e.currentTarget; setPreview(item); }}>
          <span className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border bg-background"><AttachmentThumbnail item={item} />{item.upload === 'uploading' && <span className="absolute inset-0 flex items-center justify-center bg-background/80"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none text-blue-500" /></span>}</span>
          <span className="mt-1 block truncate text-[11px]">{item.name}</span>
        </button>
        <button type="button" className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-slate-800 text-white shadow-md hover:bg-red-500 transition-colors" aria-label={`Bỏ ${item.name}`} onClick={() => void action(() => removeComposerFile(scope, item.id))}><X className="size-3" /></button>
      </div>)}
      </div>
    </section>}
    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(undefined); }}>
      <DialogContent onCloseAutoFocus={e => { e.preventDefault(); if (previewTrigger.current?.isConnected) previewTrigger.current.focus(); else document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Nội dung tin nhắn"]')?.focus(); }} className="max-h-[85dvh] overflow-auto max-w-2xl rounded-2xl motion-reduce:animate-none [&_button]:min-h-10 [&_button]:min-w-10">
        <DialogTitle className="break-all pr-10">{preview?.name}</DialogTitle><DialogDescription>Xem trước tệp trên thiết bị · {preview?.size.toLocaleString()} byte</DialogDescription>
        <p className="text-xs text-muted-foreground">Gửi từng tệp riêng, không phải album gốc. Nội dung chung chỉ gắn vào tệp đầu tiên.</p>
        {selected && <div className="space-y-2">
          <p role="status">{selected.upload === 'failed' ? selected.error || 'Tải lên thất bại. Đóng và chọn Chuẩn bị tệp để thử lại.' : selected.upload === 'missing' ? 'Thiếu tệp trên thiết bị. Bỏ và chọn lại tệp.' : selected.upload === 'ready' ? 'Sẵn sàng · chưa gửi' : 'Chuẩn bị tệp trước khi gửi.'}</p>
          <label className="block text-sm">Chú thích riêng<input aria-label={`Chú thích ${selectedIndex + 1}`} placeholder="Chú thích riêng" maxLength={20000} disabled={Boolean(batch)} value={selected.caption} onChange={event => change(attachments.map(a => a.id === selected.id ? { ...a, caption: event.target.value } : a))} className="mt-1 w-full min-h-10 rounded-lg border bg-background p-2" /></label>
          <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border px-3 disabled:opacity-50" aria-label={`Đưa tệp ${selectedIndex + 1} lên`} disabled={Boolean(batch) || selectedIndex === 0} onClick={() => move(selectedIndex, selectedIndex - 1)}>← Đưa lên trước</button><button type="button" className="rounded-lg border px-3 disabled:opacity-50" aria-label={`Đưa tệp ${selectedIndex + 1} xuống`} disabled={Boolean(batch) || selectedIndex === attachments.length - 1} onClick={() => move(selectedIndex, selectedIndex + 1)}>Đưa ra sau →</button></div>
        </div>}
        {url && preview?.type.startsWith('image/') ? <img src={url} alt={preview.name} className="w-full max-h-[55dvh] object-contain" />
          : url && preview?.type.startsWith('video/') ? <video src={url} controls preload="metadata" className="w-full max-h-[55dvh]" />
            : <p>{url ? 'Không nhúng định dạng này vì an toàn.' : 'Không có bản sao tệp trên thiết bị. Máy chủ chỉ cung cấp trạng thái.'}</p>}
        {url && <a href={url} download={preview?.name} className="underline">Tải bản cục bộ</a>}
        {url && !batch && preview?.type.startsWith('image/') && preview.type !== 'image/gif' && <div className="space-y-2">
          <p className="text-xs">Chỉnh sửa xuất PNG, bỏ metadata/hoạt ảnh và đưa tệp về cuối danh sách.</p>
          <button type="button" disabled={working} className="border p-2 rounded" onClick={() => void action(() => editImage(true))}>Xoay phải 90°</button>
          <label className="block">Giữ vùng giữa: {crop}% <input aria-label="Vùng cắt giữa" type="range" min={10} max={100} value={crop} onChange={event => setCrop(Number(event.target.value))} /></label>
          <button type="button" disabled={working || crop === 100} className="border p-2 rounded" onClick={() => void action(() => editImage(false))}>Cắt vùng giữa</button>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
