import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRichMessage } from '../src/core/message-projection.js';
import { normalizeMessageKind, normalizeMessageText, normalizeAttachments, normalizeMessageQuote } from '../src/core/runtime/normalizer.js';
import { GoldConversationRepo } from '../src/core/store/conversation-repo.js';
import { canonicalizeStoredMessage, type RawMessageRow } from '../src/core/store/helpers.js';
import { GoldMessageRepo } from '../src/core/store/message-repo.js';
import { GoldRuntime } from '../src/core/runtime/index.js';
import { SendRequestRepo } from '../src/core/store/send-request-repo.js';
import { projectPcBackupMessage } from '../scripts/zalo-pc-backup/decrypt-and-import.js';

const fixture = (msgType: number | string, message: unknown) => ({ msgId: 'provider-1', msgType, message });

test('provider sentinel words are valid ordinary text, including quotes', () => {
  for (const value of ['EVENTS', 'sendBubbleMessage', ' {"params":{"callId":"ordinary"}} ']) {
    for (const msgType of [undefined, 'webchat', 'chat.text', 0, 1]) {
      assert.equal(normalizeMessageText({ msgType, content: value }), value);
      assert.equal(normalizeMessageQuote({ quote: { msgType, content: value } })?.text, value);
    }
  }
});

test('quote metadata uses provider evidence, not serialized JSON', () => {
  const quote = { msgId: 'quoted', uidFrom: 'sender', dName: 'Name', msgType: 3,
    content: JSON.stringify({ params: { m4a: 'https://example.org/audio', duration: 1000 } }) };
  assert.deepEqual(normalizeMessageQuote({ quote }), {
    messageId: 'quoted', senderId: 'sender', senderName: 'Name', text: '[voice]', kind: 'voice',
  });
  assert.equal(normalizeMessageQuote({ quote: { msgType: 2, content: JSON.stringify({ title: 'Photo caption', oriUrl: 'https://example.org/a' }) } })?.text, 'Photo caption');
  assert.equal(normalizeMessageQuote({ quote: { msgType: 26, content: JSON.stringify({ params: { isAnonymous: true, msg: { vi: 'Alice voted' } } }) } })?.text, 'Bình chọn ẩn danh');
});

test('verified album fields retain provider indexing and reject invalid values', () => {
  const raw = fixture(2, { params: JSON.stringify({ group_layout_id: 'album-1', id_in_group: '0', total_item_in_group: '3' }) });
  const projected = projectRichMessage({}, raw);
  assert.equal(projected.presentation?.albumId, 'album-1');
  assert.equal(projected.presentation?.albumIndex, 0);
  assert.equal(projected.presentation?.albumTotal, 3);
  assert.deepEqual(projectRichMessage(projected, raw), projected);
  const invalid = projectRichMessage({}, fixture(2, { params: { group_layout_id: {}, id_in_group: -1, total_item_in_group: 1.5 } }));
  assert.equal(invalid.presentation?.albumId, undefined);
  assert.equal(invalid.presentation?.albumIndex, undefined);
  assert.equal(invalid.presentation?.albumTotal, undefined);
  assert.equal(projectRichMessage({}, { msgType: 'webchat', content: JSON.stringify(raw.message) }).presentation, undefined);
});
const row = (raw: unknown): RawMessageRow => ({
  id: 'account::direct:peer::provider-1', conversation_id: 'direct:peer', thread_id: 'peer',
  conversation_type: 'direct', friend_id: 'peer', text: '', kind: 'text', image_url: null,
  direction: 'incoming', is_self: 0, timestamp: '2026-09-27T00:00:00Z', sender_id: 'peer',
  sender_name: 'Peer', provider_message_id: 'provider-1', raw_message_json: raw as RawMessageRow['raw_message_json'], reactions_json: null,
});

test('PC importer uses evidence-backed numeric mapping, not old guesses', () => {
  for (const [type, kind] of [[2,'image'],[3,'voice'],[4,'sticker'],[18,'video'],[19,'file'],[26,'poll'],[-1909,'system'],[17,'location'],[25,'card'],[52,'card'],[999,'unknown']] as const) {
    assert.equal(projectPcBackupMessage(fixture(type, {})).kind, kind);
    assert.equal(normalizeMessageKind(fixture(type, {})), kind);
  }
});

test('ordinary webchat JSON remains byte-for-byte text', () => {
  const value = ' {"title":"sendBubbleMessage","params":{"callId":"x"},"oriUrl":"https://example.org/a"} ';
  const projected = projectRichMessage({ text: value }, { msgType: 'webchat', content: value });
  assert.equal(projected.text, value);
  assert.equal(projected.kind, 'text');
  assert.deepEqual(projected.attachments, []);
  assert.equal(projected.presentation, undefined);
  assert.equal(normalizeMessageKind({ content: value }), 'text');
  assert.equal(normalizeMessageText({ msgType: 'webchat', content: value }), value);
});

test('raw object, JSON string and data wrappers share semantics and captions', () => {
  const raw = fixture(2, JSON.stringify({ oriUrl: 'https://example.org/a.jpg', thumbUrl: 'https://example.org/t.jpg', title: 'Customer caption', params: '{"unrelated":1}' }));
  for (const wrapped of [raw, JSON.stringify(raw), { data: raw }, { data: JSON.stringify(raw) }, JSON.stringify({ data: raw })]) {
    const result = projectRichMessage({}, wrapped);
    assert.equal(result.text, 'Customer caption');
    assert.equal(result.presentation?.url, 'https://example.org/a.jpg');
    assert.equal(result.presentation?.thumbnailUrl, 'https://example.org/t.jpg');
    assert.deepEqual(projectRichMessage(result, wrapped), result);
  }
  assert.equal(normalizeMessageText(raw), 'Customer caption');
});

test('voice duration is milliseconds in attachment and seconds in presentation; missing sticker is honest', () => {
  const raw = fixture(3, { params: JSON.stringify({ m4a: 'https://example.org/a.m4a', duration: 2500, waveformSamples: [1,2] }) });
  assert.equal(normalizeAttachments(raw)[0].type, 'voice');
  assert.equal(normalizeAttachments(raw)[0].duration, 2500);
  assert.equal(projectRichMessage({}, raw).presentation?.durationSeconds, 2.5);
  const sticker = projectPcBackupMessage(fixture(4, { id: 42, catId: 9, type: 1 }));
  assert.equal(sticker.text, '[sticker]');
  assert.equal(sticker.presentation?.unavailable, true);
});

test('calls require callId AND sendBubbleMessage; numeric reasons are never guessed', () => {
  for (const type of [6, 'chat.recommended']) {
    const call = projectRichMessage({}, fixture(type, { title: 'sendBubbleMessage', params: { callId: 'c', reason: 5, calltype: 2, duration: 0 } }));
    assert.equal(call.kind, 'call');
    assert.equal(call.text, 'Cuộc gọi');
    assert.equal(projectRichMessage({}, fixture(type, { title: 'Website', href: 'https://example.org' })).kind, 'link');
    assert.equal(projectRichMessage({}, fixture(type, { title: 'sendBubbleMessage' })).kind, 'link');
  }
});

test('anonymous poll hides event actor and unknown system placeholders fall back safely', () => {
  const raw = fixture(26, { title: 'EVENTS', params: JSON.stringify({ msg: { vi: 'Alice voted' }, question: 'Lunch?', dName: 'Alice', isAnonymous: true }) });
  assert.equal(projectRichMessage({}, raw).text, 'Lunch?');
  assert.equal(projectRichMessage({}, fixture(26, { params: { msg: { vi: 'Alice voted' }, isAnonymous: 1 } })).text, 'Bình chọn ẩn danh');
  assert.equal(projectRichMessage({}, fixture(-1909, { title: '{unknown} joined' })).text, 'Thông báo hệ thống');
  assert.equal(projectRichMessage({}, fixture(17, { lat: -12.5, lo: 106 })).presentation?.latitude, -12.5);
  assert.equal(projectRichMessage({}, fixture(17, { lat: 999, lo: 106 })).presentation?.unavailable, true);
});

test('stored projection preserves local URLs, all metadata, IDs and raw; repeat is stable', () => {
  const raw = fixture(18, { oriUrl: 'https://expired.example/a.mp4', title: 'Video caption' });
  const stored = { id: 'stable', kind: 'file' as const, text: JSON.stringify(raw.message), rawMessageJson: raw,
    attachments: [{ id: 'att-stable', type: 'file' as const, url: '/media/local.mp4', sourceUrl: 'https://old.example/a.mp4', thumbnailUrl: '/media/thumb.jpg', localPath: '/disk/local.mp4', duration: 7000, mimeType: 'video/mp4', size: 42 }],
  };
  const result = projectRichMessage(stored);
  assert.equal(result.id, stored.id);
  assert.equal(result.rawMessageJson, raw);
  assert.equal(result.attachments[0].id, 'att-stable');
  assert.equal(result.attachments[0].size, 42);
  assert.equal(result.presentation?.url, '/media/local.mp4');
  assert.equal(result.presentation?.durationSeconds, 7);
  assert.equal(result.presentation?.thumbnailUrl, '/media/thumb.jpg');
  assert.equal(result.text, 'Video caption');
  assert.deepEqual(projectRichMessage(result), result);
  assert.equal(stored.attachments[0].type, 'file');
  assert.equal(canonicalizeStoredMessage({ ...row(raw), image_url: '/media/legacy.mp4' }, []).presentation?.url, '/media/legacy.mp4');
});

test('all repository readers carry presentation, including manual monitor and ID mappings', async () => {
  const stored = row({ data: fixture(3, { params: { m4a: 'https://example.org/a.m4a', duration: 3000 } }) });
  const query: any = { where: () => query, orWhere: () => query, first: async () => stored };
  const db: any = () => query;
  db.raw = async (sql: string) => ({ rows: sql.includes('FROM attachments') || sql.includes('SELECT 1') ? [] : [stored] });
  const repo = new GoldMessageRepo(db, () => 'account', () => 'account');
  const messages = [
    ...(await repo.listConversationMessagesByAccount('account', 'direct:peer')),
    ...(await repo.listMonitorMessagesByAccountAndRange('account', { from: '2026-01-01', to: '2027-01-01' })).items,
    (await repo.getMessageById('account', stored.id))!,
  ];
  assert.equal(messages.length, 3);
  for (const result of messages) {
    assert.equal(result.kind, 'voice');
    assert.equal(result.presentation?.version, 1);
    assert.equal(result.presentation?.durationSeconds, 3);
    assert.equal(result.id, stored.id);
    assert.deepEqual(JSON.parse(result.rawMessageJson!), stored.raw_message_json);
  }
});

test('runtime repair accepts DB objects and does not replace mirrored URLs', () => {
  const raw = { data: fixture(18, { oriUrl: 'https://example.org/v.mp4', title: 'Caption' }) };
  const runtime = Object.create(GoldRuntime.prototype);
  const message = { id: 'runtime-id', kind: 'file', text: '', rawMessageJson: raw,
    attachments: [{ id: 'local-id', type: 'video', url: '/media/v.mp4', duration: 8000 }] };
  const repaired = runtime.repairMessageFromRawPayload(message);
  assert.equal(repaired.presentation.url, '/media/v.mp4');
  assert.equal(repaired.presentation.durationSeconds, 8);
  assert.equal(repaired.kind, 'video');
  assert.equal(repaired.rawMessageJson, raw);
  assert.deepEqual(runtime.repairMessageFromRawPayload(repaired), repaired);
});

test('unsafe links, malformed source and custom-card metadata have readable fallbacks', () => {
  assert.equal(projectRichMessage({}, fixture(6, { href: 'javascript:alert(1)' })).presentation?.url, undefined);
  assert.equal(projectRichMessage({}, fixture(52, { title: '{"internal":42}' })).text, 'Thẻ thông tin');
  assert.equal(projectRichMessage({}, fixture(25, { title: 'Business contact' })).text, 'Business contact');
  assert.equal(projectRichMessage({ text: 'ordinary', kind: 'text' }, '{broken').text, 'ordinary');
  assert.equal(projectRichMessage({}, fixture(19, { href: 'https://example.org/a.pdf', title: 'a.pdf' })).attachments[0].fileName, 'a.pdf');
});

test('receipt snapshot reader projects messages without dropping request identity', async () => {
  const snapshot = { client_request_id: 'request', message_refs_json: [{ id: 'snapshot', kind: 'voice', text: '[voice]', attachments: [], rawMessageJson: JSON.stringify(fixture(3, { params: { m4a: 'https://example.org/audio', duration: 1000 } })) }] };
  const query: any = { where: () => query, first: async () => snapshot };
  const repo = new SendRequestRepo((() => query) as any);
  const result = await repo.get('account', 'request');
  assert.equal(result?.client_request_id, 'request');
  assert.equal(result?.message_refs_json[0].presentation?.durationSeconds, 1);
  assert.equal(result?.message_refs_json[0].id, 'snapshot');
});

test('all summary readers batch latest message projection; monitor bindings follow SQL order', async () => {
  const summaries = [0, 1, 2].map(i => ({ id: `direct:${i}`, thread_id: String(i), type: 'direct', friend_id: String(i),
    title: 'Known', avatar: '/avatar', last_message_text: 'stale serialized metadata', last_message_kind: 'text',
    last_message_timestamp: '2026-09-27', last_direction: 'incoming', message_count: 1, unread_count: 1 }));
  const ordinary = ' {"title":"EVENTS"} ';
  let batches = 0;
  const db: any = { raw: async (sql: string, bindings: unknown[]) => {
    assert.equal((sql.match(/\?/g) ?? []).length, bindings.length, 'placeholder count');
    if (sql.includes('preview_conversation_id')) {
      batches++;
      assert.equal(bindings[0], 'account');
      assert.ok(sql.includes('m.account_id = c.account_id'));
      assert.ok(sql.includes('ORDER BY m.timestamp DESC, m.created_at DESC, m.id DESC'));
      assert.ok(sql.includes('att.message_id = m.id'));
      return { rows: (bindings[1] as string[]).map(id => ({ ...row(null), preview_conversation_id: id,
        text: id === 'direct:1' ? ordinary : '', kind: 'text',
        raw_message_json: id === 'direct:0' ? fixture(3, { params: { m4a: 'https://example.org/v' } })
          : id === 'direct:1' ? { msgType: 'webchat', content: ordinary } : null,
        preview_attachment: id === 'direct:2' ? { id: 'att', type: 'video', url: '/media/local.mp4' } : null,
      })) };
    }
    if (sql.includes('COUNT(*)::int AS cnt')) return { rows: [] };
    if (sql.includes('message_count_in_range')) {
      assert.deepEqual(bindings, ['from', 'to', 'account', 'from', 'to', 'direct', 'cursor', 'from', 'to', 11]);
    }
    return { rows: structuredClone(sql.includes('AND c.id = ?') ? summaries.slice(0, 1) : summaries) };
  } };
  const unused = async () => { throw new Error('unexpected per-conversation metadata lookup'); };
  const repo = new GoldConversationRepo(db, () => 'account', unused, unused, unused, unused);
  const readers = [
    () => repo.listConversationSummariesByAccount('account'),
    async () => (await repo.listMonitorConversationsByAccountAndRange('account', { from: 'from', to: 'to', type: 'direct', cursor: 'cursor', onlyUnread: true, limit: 10 })).items,
    () => repo.listUnreadConversationsByAccount('account'),
  ];
  for (const read of readers) {
    const before = batches;
    const result = await read();
    assert.equal(batches - before, 1);
    assert.equal(result[0].lastMessageKind, 'voice');
    assert.equal(result[0].lastMessageText, '[voice]');
    assert.equal(result[1].lastMessageKind, 'text');
    assert.equal(result[1].lastMessageText, ordinary);
    assert.equal(result[2].lastMessageKind, 'video');
  }
  assert.equal((await repo.getConversationSummaryByAccountAndId('account', 'direct:0'))?.lastMessageKind, 'voice');
  assert.equal(batches, 4);
});

test('summary projection chunks unbounded unread lists and preserves rows without history', async () => {
  const sizes: number[] = [];
  const summaries = Array.from({ length: 401 }, (_, i) => ({ id: `direct:${i}`, thread_id: String(i), type: 'direct', friend_id: String(i),
    title: 'Known', avatar: '/avatar', last_message_text: 'EVENTS', last_message_kind: 'text' }));
  const db: any = { raw: async (sql: string, bindings: unknown[]) => {
    if (sql.includes('preview_conversation_id')) { sizes.push((bindings[1] as string[]).length); return { rows: [] }; }
    return { rows: structuredClone(summaries) };
  } };
  const unused = async () => undefined;
  const repo = new GoldConversationRepo(db, () => 'account', unused, unused, unused, unused);
  const result = await repo.listUnreadConversationsByAccount('account');
  assert.deepEqual(sizes, [200, 200, 1]);
  assert.equal(result.length, 401);
  assert.ok(result.every(item => item.lastMessageText === 'EVENTS'));
});
