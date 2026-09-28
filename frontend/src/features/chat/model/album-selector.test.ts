import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Message } from '@/types';
import { selectAlbumRows } from './album-selector';
import { AlbumMessage } from '../components/messages/AlbumMessage';

export function albumFixture(id: string, patch: Partial<Message> = {}): Message {
  return { id, providerMessageId: `provider-${id}`, conversationId: 'group:1', threadId: '1', conversationType: 'group',
    kind: 'image', text: '', direction: 'incoming', isSelf: false, senderId: 'sender', senderName: 'An',
    timestamp: '2026-09-27T10:00:00Z', attachments: [{ id: 'photo', type: 'image', url: `/media/${id}.png` }],
    presentation: { version: 1, albumId: 'album', albumIndex: Number(id), albumTotal: 6 }, ...patch };
}

test('only verified album IDs group; proximity and equal sender names never establish membership', () => {
  assert.equal(selectAlbumRows([albumFixture('1'), albumFixture('2')], 'account').length, 1);
  for (const patch of [{ presentation: undefined }, { senderId: undefined }, { senderId: 'other' },
    { conversationId: 'group:2' }, { direction: 'outgoing' as const }, { timestamp: '2026-09-28T10:00:00Z' },
    { timestamp: 'invalid' }, { presentation: { version: 1 as const, albumId: 'other' } }]) {
    assert.equal(selectAlbumRows([albumFixture('1'), albumFixture('2', patch)], 'account').length, 2);
  }
  assert.equal(selectAlbumRows([albumFixture('1'), albumFixture('2')], '').length, 2);
  assert.notEqual(selectAlbumRows([albumFixture('1')], 'a')[0].key, selectAlbumRows([albumFixture('1')], 'b')[0].key);
});

test('interleaved text, other albums and mixed media preserve boundaries and every original message', () => {
  const messages = [albumFixture('1'), albumFixture('text', { kind: 'text', attachments: [], text: 'Do not move me' }), albumFixture('2')];
  const rows = selectAlbumRows(messages, 'a');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.flatMap(r => r.messages), messages);
  const mixed = albumFixture('3', { attachments: [{ id: 'doc', type: 'file', url: '/doc.pdf' }] });
  assert.equal(selectAlbumRows([albumFixture('1'), mixed, albumFixture('2')], 'a').length, 3);
});

test('SDK reverse indices sort descending; missing and repeated indices retain whole-run input order', () => {
  assert.deepEqual(selectAlbumRows(['0', '2', '1'].map(id => albumFixture(id)), 'a')[0].media.map(m => m.message.id), ['2', '1', '0']);
  for (const index of [undefined, 1, -1, NaN]) {
    const rows = selectAlbumRows([albumFixture('1'), albumFixture('2', { presentation: { version: 1, albumId: 'album', albumIndex: index } })], 'a');
    assert.deepEqual(rows[0].media.map(m => m.message.id), ['1', '2']);
  }
});

test('dedup provider echoes without URL-based conflation; attachment slot identity and original targets survive', () => {
  const message = albumFixture('1', { attachments: [{ id: 'same', type: 'image', url: '/same.png' }, { id: 'same', type: 'image', url: '/same.png' }] });
  const echo = { ...message, id: 'echo' };
  const row = selectAlbumRows([message, echo, albumFixture('2')], 'a')[0];
  assert.equal(row.messages.length, 3);
  assert.equal(row.media.length, 3);
  assert.equal(new Set(row.media.map(m => m.key)).size, 3);
  assert.equal(row.media[1].message, message);
});

test('partial pagination/realtime merge uses loaded unique count, stable keys and honest conflicting totals', () => {
  const before = selectAlbumRows([albumFixture('1')], 'a')[0];
  const after = selectAlbumRows([albumFixture('2'), albumFixture('1'), albumFixture('0')], 'a')[0];
  assert.equal(before.media[0].key, after.media[1].key);
  assert.equal(after.total, 6);
  assert.equal(after.media.length, 3);
  assert.equal(selectAlbumRows([albumFixture('1'), albumFixture('2', { presentation: { version: 1, albumId: 'album', albumTotal: 9 } })], 'a')[0].total, undefined);
});

test('SSR bounded grids, overflow, all captions, quotes, per-message status and history hint', () => {
  for (const count of [1, 2, 3, 4, 6]) {
    const row = selectAlbumRows(Array.from({ length: count }, (_, i) => albumFixture(String(i), {
      text: `Caption-${i}`, direction: 'outgoing', delivery: 'sent', reactions: [{ emoji: '❤️', count: i + 1 }],
      quote: { text: `Quote-${i}` },
    })), 'a')[0];
    const html = renderToStaticMarkup(React.createElement(AlbumMessage, { row, isGroup: true, hasMoreHistory: true, onReply() {}, onReact() {} }));
    assert.equal((html.match(/data-album-item=/g) || []).length, Math.min(count, 4));
    assert.match(html, new RegExp(`data-album-grid="${Math.min(count, 4)}"`));
    for (let i = 0; i < count; i++) {
      assert.match(html, new RegExp(`Caption-${i}`)); assert.match(html, new RegExp(`Quote-${i}`));
      assert.match(html, new RegExp(`data-action-message="${i}"`));
      assert.match(html, new RegExp(`data-status-message="${i}"`));
    }
    if (count > 4) assert.match(html, /\+2/);
    if (count < 6) assert.match(html, /Kéo lên để tải thêm lịch sử/);
    assert.match(html, /Đã gửi thành công/);
  }
});
