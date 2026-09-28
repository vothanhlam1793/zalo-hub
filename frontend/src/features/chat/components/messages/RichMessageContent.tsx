import React from 'react';
import type { Message } from '@/types';
import { safeHttpUrl } from '@/utils';
import { messagePreview } from '../../model/message-preview';
import { SafeImage } from './MessageMedia';

export function RichMessageContent({ message }: { message: Message }) {
  const { kind, presentation: p } = message;
  const label = messagePreview(message);
  if (kind === 'call') return <div className="text-sm">☎ {label}</div>;
  if (kind === 'system' || kind === 'reaction') return <div className="text-xs text-muted-foreground" role="note">{label}</div>;
  if (kind === 'poll') return <div><div>📊 {label}</div><p className="text-xs opacity-75">Xem chi tiết bình chọn trên Zalo.</p></div>;
  if (kind === 'unknown') return <div><div>{label}</div><p className="text-xs opacity-75">Xem nội dung gốc trên Zalo.</p></div>;
  if (!['location', 'link', 'card'].includes(kind)) return null;
  const lat = p?.latitude;
  const lon = p?.longitude;
  const hasCoordinates = typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180;
  const url = kind === 'location' && hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : safeHttpUrl(p?.url);
  return <div className="space-y-2 rounded-lg border border-current/20 p-3">
    {p?.thumbnailUrl && <SafeImage src={p.thumbnailUrl} alt="Ảnh xem trước" className="max-h-40 max-w-full rounded object-contain" />}
    <div className="font-medium whitespace-pre-wrap">{label}</div>
    {kind === 'location' && hasCoordinates && <div className="text-xs">{lat}, {lon}</div>}
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all">{kind === 'location' ? 'Mở bản đồ' : 'Mở liên kết'}</a>
      : <p className="text-xs opacity-75">{kind === 'location' ? 'Vị trí không khả dụng.' : 'Không có liên kết khả dụng. Xem chi tiết trên Zalo.'}</p>}
  </div>;
}
