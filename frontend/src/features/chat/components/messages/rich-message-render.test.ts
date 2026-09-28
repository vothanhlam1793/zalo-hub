import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Message } from '@/types';
import { MessageBubble } from '../MessageBubble';
import { attachmentSource, claimAudio, mediaKey, messageAttachments, releaseAudio, SafeImage } from './MessageMedia';
import { formatDuration, messagePreview } from '../../model/message-preview';
import { isImageAttachment, safeHttpUrl, safeMediaUrl } from '@/utils';
import { createLocalMediaPreview, revokeLocalMediaPreview } from '../../model/local-media-preview';

function fixture(patch: Partial<Message> = {}): Message {
  return { id: 'message-1', conversationId: 'direct:1', threadId: '1', conversationType: 'direct',
    text: '', kind: 'text', attachments: [], direction: 'incoming', isSelf: false,
    timestamp: '2026-09-27T10:00:00Z', ...patch };
}
function render(patch: Partial<Message>) {
  return renderToStaticMarkup(React.createElement(MessageBubble, {
    msg: fixture(patch), isGroup: false, onReply: () => {}, onReact: () => {}, onOpenLightbox: () => {},
  }));
}

test('optimistic local blob renders only with explicit context and tab-owned URL registration', () => {
  const url = createLocalMediaPreview(new Blob(['image'], { type: 'image/png' }));
  try {
    assert.equal(safeMediaUrl(url), undefined);
    assert.equal(safeMediaUrl(url, 'local-preview'), url);
    assert.equal(safeMediaUrl('blob:https://provider.example/fake', 'local-preview'), undefined);
    assert.match(render({ id: 'pending-1', kind: 'image', attachments: [{ id: 'pending-1', type: 'image', url }] }), /src="blob:/);
    assert.doesNotMatch(render({ kind: 'image', attachments: [{ id: 'provider', type: 'image', url: 'blob:https://provider.example/fake' }] }), /src="blob:/);
    assert.match(renderToStaticMarkup(React.createElement(SafeImage, { src: url, alt: 'Provider image' })), /không khả dụng/);
  } finally { revokeLocalMediaPreview(url); }
  assert.equal(safeMediaUrl(url, 'local-preview'), undefined);
});

test('voice uses user initiated native playback, milliseconds and mirrored URL', () => {
  const html = render({ kind: 'voice', text: '[voice]', attachments: [{ id: 'a', type: 'voice', url: '/media/voice.m4a', sourceUrl: 'https://expired.example/a', duration: 65000 }] });
  assert.match(html, /<audio[^>]*controls=""[^>]*preload="none"[^>]*src="\/media\/voice.m4a"/);
  assert.match(html, /1:05/);
  assert.doesNotMatch(html, /autoPlay|autoplay|\[voice\]|expired.example/);
});

test('audio coordinator pauses previous player and releases on cleanup', () => {
  let firstPauses = 0; let secondPauses = 0;
  const first = { pause() { firstPauses++; } } as HTMLMediaElement;
  const second = { pause() { secondPauses++; } } as HTMLMediaElement;
  claimAudio(first); claimAudio(first);
  assert.equal(firstPauses, 0);
  claimAudio(second);
  assert.equal(firstPauses, 1);
  releaseAudio(first); // Old component cleanup must not clear the new player.
  claimAudio(first);
  assert.equal(secondPauses, 1);
  releaseAudio(first);
});

test('video shows canonical poster and duration without autoplay', () => {
  const html = render({ kind: 'video', text: '[video]', presentation: { version: 1, url: '/media/movie.mp4', thumbnailUrl: '/media/poster.jpg', durationSeconds: 12.5 } });
  assert.match(html, /<video/);
  assert.match(html, /poster="\/media\/poster.jpg"/);
  assert.match(html, /0:12/);
  assert.match(html, /Mở \/ tải video/);
  assert.doesNotMatch(html, /autoplay/i);
});

test('GIF video MIME uses video while image GIF uses image', () => {
  const video = render({ kind: 'gif', attachments: [{ id: 'g', type: 'gif', url: '/g', mimeType: 'video/mp4' }] });
  assert.match(video, /<video/); assert.doesNotMatch(video, /<img/);
  const image = render({ kind: 'gif', attachments: [{ id: 'g', type: 'gif', url: '/g', mimeType: 'image/gif' }] });
  assert.match(image, /<img/); assert.doesNotMatch(image, /<video/);
  assert.equal(isImageAttachment({ kind: 'gif' }, undefined, 'video/mp4'), false);
});

test('missing media and unsafe sticker sources show readable fallback, never empty src', () => {
  for (const kind of ['voice', 'video', 'image', 'sticker', 'gif', 'file'] as const) {
    const html = render({ kind, text: `[${kind}]`, presentation: { version: 1, unavailable: true } });
    assert.match(html, /không khả dụng/);
    assert.doesNotMatch(html, /src=""|\[(voice|video|image|sticker|gif|file)\]/);
  }
  assert.match(renderToStaticMarkup(React.createElement(SafeImage, { src: 'javascript:alert(1)', alt: 'Nhãn dán' })), /Nhãn dán không khả dụng/);
  assert.match(render({ kind: 'sticker', attachments: [{ id: 's', type: 'sticker', thumbnailUrl: '/sticker.png' }] }), /src="\/sticker.png"/);
  assert.doesNotMatch(render({ kind: 'video', attachments: [{ id: 'v', type: 'video', thumbnailUrl: '/poster.png' }] }), /<video/);
});

test('all attachments render with distinct lightbox keys, including duplicate attachment IDs', () => {
  const message = fixture({ kind: 'image', attachments: [
    { id: 'same', type: 'image', url: '/first.jpg' }, { id: 'same', type: 'image', url: '/second.jpg' },
    { id: 'doc', type: 'file', url: '/report.pdf', fileName: 'report.pdf' },
  ] });
  const html = render(message);
  assert.match(html, /src="\/first.jpg"/); assert.match(html, /src="\/second.jpg"/); assert.match(html, /report.pdf/);
  assert.notEqual(mediaKey(message.id, 'same', 0), mediaKey(message.id, 'same', 1));
  assert.equal(messageAttachments(message).length, 3);
  assert.equal(attachmentSource(message, message.attachments[1], 1), '/second.jpg');
});

test('call is neutral even when text contains legacy outcome, raw provider data is ignored', () => {
  const html = render({ kind: 'call', text: 'Missed call', rawMessageJson: '{"outcome":"declined"}', presentation: { version: 1, durationSeconds: 0 } });
  assert.match(html, /Cuộc gọi · 0:00/);
  assert.doesNotMatch(html, /Missed|declined|nhỡ|từ chối/);
});

test('system and poll readable, no interactive polling inferred', () => {
  assert.match(render({ kind: 'system', text: 'An đã tham gia nhóm' }), /role="note">An đã tham gia nhóm/);
  assert.match(render({ kind: 'poll', text: 'Chọn lịch họp' }), /Xem chi tiết bình chọn trên Zalo/);
});

test('location and cards only navigate to safe HTTP URLs', () => {
  const location = render({ kind: 'location', presentation: { version: 1, latitude: 0, longitude: 0 } });
  assert.match(location, /google.com\/maps\/search/);
  assert.match(location, /query=0,0/);
  for (const kind of ['link', 'card', 'location'] as const) {
    assert.doesNotMatch(render({ kind, presentation: { version: 1, url: 'javascript:alert(1)', latitude: 91, longitude: 0 } }), /href="javascript|google.com/);
  }
  assert.match(render({ kind: 'card', text: 'Danh thiếp', presentation: { version: 1, url: 'https://example.com/card' } }), /rel="noopener noreferrer"/);
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', 'https://user:pass@example.com']) {
    assert.equal(safeHttpUrl(value), undefined);
    assert.equal(safeMediaUrl(value), undefined);
  }
});

test('preview preserves ordinary JSON and custom bracket text, supports privacy and known placeholders', () => {
  for (const text of ['{"hello":"world"}', '[custom]', ' hello ']) {
    assert.equal(messagePreview({ kind: 'text', text }), text.trim());
  }
  assert.equal(messagePreview({ kind: 'voice', text: '[voice]' }), 'Tin nhắn thoại');
  assert.equal(messagePreview({ kind: 'card', text: '{"custom":true}' }), '{"custom":true}');
  assert.equal(messagePreview({ kind: 'text', text: 'private' }, { showMessagePreview: false }), 'Tin nhắn mới');
  assert.equal(formatDuration(NaN), ''); assert.equal(formatDuration(-1), '');
});

test('quote, received reaction counts, outgoing delivery and reply/reaction actions survive rich rendering', () => {
  const html = render({ kind: 'sticker', direction: 'outgoing', delivery: 'sent', providerMessageId: 'provider-1',
    quote: { senderName: 'An', kind: 'voice', text: '[voice]' }, reactions: [{ emoji: '❤️', count: 3 }, { emoji: '👍', count: 0 }] });
  assert.match(html, /Tin nhắn thoại/); assert.match(html, /❤️ 3/); assert.doesNotMatch(html, /👍 0/);
  assert.match(html, /Đã gửi thành công/); assert.match(html, /Trả lời tin nhắn này/); assert.match(html, /Thả cảm xúc/);
});
