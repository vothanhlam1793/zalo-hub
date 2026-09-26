import type { Page } from 'playwright';
import type { Knex } from 'knex';
import type { GoldLogger } from './logger.js';
import type { GoldConversationMessage } from './types.js';
import { buildStoredMessageId } from './store/helpers.js';

export interface IndexedDbDumpResult {
  accountId: string;
  totalThreads: number;
  totalMessages: number;
  insertedMessages: number;
  updatedConversations: number;
  durationMs: number;
}

export class IndexedDbImporter {
  constructor(
    private readonly knex: Knex,
    private readonly logger: GoldLogger,
  ) {}

  /**
   * Extract all messages and threads from Zalo Web's IndexedDB in the browser page context.
   */
  async dumpFromPage(page: Page, accountId: string): Promise<{ threads: any[]; messages: any[]; contacts: any[]; groups: any[] }> {
    const dbName = `zdb_${accountId}`;
    this.logger.info('indexeddb_dump_start', { dbName, accountId });

    const rawData = await page.evaluate(async (targetDbName: string) => {
      return new Promise<{ threads: any[]; messages: any[]; contacts: any[]; groups: any[] }>((resolve, reject) => {
        const req = indexedDB.open(targetDbName);
        req.onerror = () => reject(new Error(`Khong the mo IndexedDB ${targetDbName}: ${req.error?.message}`));
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames);
          const result: { threads: any[]; messages: any[]; contacts: any[]; groups: any[] } = {
            threads: [],
            messages: [],
            contacts: [],
            groups: [],
          };

          const pendingStores = ['messages', 'threads', 'contacts', 'group_info', 'conversations', 'friend_info'].filter((name) =>
            storeNames.includes(name)
          );

          if (pendingStores.length === 0) {
            db.close();
            return resolve(result);
          }

          let remaining = pendingStores.length;
          const trx = db.transaction(pendingStores, 'readonly');

          for (const storeName of pendingStores) {
            const store = trx.objectStore(storeName);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              if (storeName === 'messages') result.messages = getAllReq.result || [];
              else if (storeName === 'threads' || storeName === 'conversations') result.threads = getAllReq.result || [];
              else if (storeName === 'contacts' || storeName === 'friend_info') result.contacts = getAllReq.result || [];
              else if (storeName === 'group_info' || storeName === 'groups') result.groups = getAllReq.result || [];

              remaining--;
              if (remaining === 0) {
                db.close();
                resolve(result);
              }
            };
            getAllReq.onerror = () => {
              remaining--;
              if (remaining === 0) {
                db.close();
                resolve(result);
              }
            };
          }
        };
      });
    }, dbName);

    this.logger.info('indexeddb_dump_extracted', {
      accountId,
      threadCount: rawData.threads.length,
      messageCount: rawData.messages.length,
      contactCount: rawData.contacts.length,
      groupCount: rawData.groups.length,
    });

    return rawData;
  }

  /**
   * Import extracted IndexedDB payload into ZaloHub PostgreSQL database with batching and deduplication.
   */
  async importDumpToPostgres(
    accountId: string,
    dump: { threads: any[]; messages: any[]; contacts?: any[]; groups?: any[] },
    onProgress?: (progress: { inserted: number; total: number; percent: number }) => void,
  ): Promise<IndexedDbDumpResult> {
    const startTime = Date.now();
    let insertedMessages = 0;
    let updatedConversations = 0;

    const rawMessages = dump.messages || [];
    const totalMessages = rawMessages.length;

    this.logger.info('indexeddb_import_started', { accountId, totalMessages });

    // Step 1: Upsert Contacts / Friends if available
    if (dump.contacts && dump.contacts.length > 0) {
      for (const contact of dump.contacts) {
        const friendId = String(contact.userId || contact.uid || contact.id || '').trim();
        if (!friendId) continue;
        const displayName = String(contact.displayName || contact.zaloName || contact.name || '').trim();
        const avatar = String(contact.avatar || contact.avatarUrl || '').trim();
        const phoneNumber = String(contact.phoneNumber || contact.phone || '').trim();

        await this.knex.raw(`
          INSERT INTO friends (account_id, friend_id, display_name, avatar, phone_number, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          ON CONFLICT (account_id, friend_id) DO UPDATE SET
            display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), friends.display_name),
            avatar = COALESCE(NULLIF(EXCLUDED.avatar, ''), friends.avatar),
            phone_number = COALESCE(NULLIF(EXCLUDED.phone_number, ''), friends.phone_number),
            updated_at = NOW()
        `, [accountId, friendId, displayName || null, avatar || null, phoneNumber || null]).catch(() => undefined);
      }
    }

    // Step 2: Upsert Groups if available
    if (dump.groups && dump.groups.length > 0) {
      for (const group of dump.groups) {
        const groupId = String(group.grid || group.groupId || group.id || '').trim();
        if (!groupId) continue;
        const name = String(group.name || group.groupName || '').trim();
        const avatar = String(group.avatar || group.avt || '').trim();
        const memberCount = Number(group.totalMember || group.memberCount || 0);

        await this.knex.raw(`
          INSERT INTO groups (account_id, group_id, name, avatar, member_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          ON CONFLICT (account_id, group_id) DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), groups.name),
            avatar = COALESCE(NULLIF(EXCLUDED.avatar, ''), groups.avatar),
            member_count = EXCLUDED.member_count,
            updated_at = NOW()
        `, [accountId, groupId, name || 'Nhóm Zalo', avatar || null, memberCount]).catch(() => undefined);
      }
    }

    // Step 3: Batch insert messages (Chunk size = 300 to avoid giant SQL queries)
    const chunkSize = 300;
    const conversationMap = new Map<string, { threadId: string; type: 'direct' | 'group'; lastMsg: any }>();

    for (let i = 0; i < rawMessages.length; i += chunkSize) {
      const chunk = rawMessages.slice(i, i + chunkSize);

      await this.knex.transaction(async (trx) => {
        for (const raw of chunk) {
          const providerMsgId = String(raw.msgId || raw.globalMsgId || raw.id || '').trim();
          if (!providerMsgId) continue;

          const rawThreadId = String(raw.threadId || raw.uidTo || raw.toId || raw.userId || '').trim();
          const isGroup = Boolean(raw.isGroup || (raw.threadId && raw.threadId.length > 18) || raw.groupId);
          const convType: 'direct' | 'group' = isGroup ? 'group' : 'direct';
          const threadId = rawThreadId || (isGroup ? String(raw.groupId || '') : String(raw.uidFrom || ''));
          if (!threadId) continue;

          const convId = `${convType}:${threadId}`;
          const isSelf = Boolean(raw.isSelf || raw.fromMe || raw.uidFrom === accountId);
          const senderId = String(raw.uidFrom || (isSelf ? accountId : threadId)).trim();
          const senderName = String(raw.senderName || (isSelf ? 'Bạn' : '')).trim();
          const timestamp = raw.timestamp || raw.ts || raw.createdTime || Date.now();
          const timestampIso = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : String(timestamp);

          let text = '';
          let kind = 'text';
          if (typeof raw.content === 'string') {
            text = raw.content;
          } else if (raw.content?.text) {
            text = raw.content.text;
          } else if (raw.msg) {
            text = String(raw.msg);
          } else if (raw.message) {
            text = String(raw.message);
          }

          if (raw.msgType === 'chat.photo' || raw.photo || raw.type === 'photo') {
            kind = 'image';
          } else if (raw.msgType === 'chat.file' || raw.file) {
            kind = 'file';
          } else if (raw.msgType === 'chat.sticker' || raw.sticker) {
            kind = 'sticker';
          }

          const storedId = buildStoredMessageId(accountId, providerMsgId);

          const insertRes = await trx.raw(`
            INSERT INTO messages (
              id,
              conversation_id,
              account_id,
              thread_id,
              conversation_type,
              friend_id,
              provider_message_id,
              sender_id,
              sender_name,
              direction,
              kind,
              text,
              image_url,
              is_self,
              timestamp,
              raw_message_json,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON CONFLICT (id) DO NOTHING
            RETURNING id;
          `, [
            storedId,
            convId,
            accountId,
            threadId,
            convType,
            convType === 'direct' ? threadId : '',
            providerMsgId,
            senderId,
            senderName || null,
            isSelf ? 'outgoing' : 'incoming',
            kind,
            text,
            raw.photo?.url || raw.thumbUrl || null,
            isSelf,
            timestampIso,
            JSON.stringify(raw),
          ]);

          if (insertRes.rows && insertRes.rows.length > 0) {
            insertedMessages++;
          }

          // Track latest message per conversation
          const existing = conversationMap.get(convId);
          if (!existing || new Date(timestampIso) > new Date(existing.lastMsg.timestampIso)) {
            conversationMap.set(convId, {
              threadId,
              type: convType,
              lastMsg: { text, timestampIso, isSelf, senderName },
            });
          }
        }
      });

      if (onProgress) {
        onProgress({
          inserted: insertedMessages,
          total: totalMessages,
          percent: Math.min(100, Math.round(((i + chunk.length) / totalMessages) * 100)),
        });
      }
    }

    // Step 4: Upsert Conversations Summary
    for (const [convId, convData] of conversationMap.entries()) {
      await this.knex.raw(`
        INSERT INTO conversations (
          conversation_id,
          account_id,
          thread_id,
          type,
          last_message_at,
          last_message_preview,
          updated_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON CONFLICT (conversation_id) DO UPDATE SET
          last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
          last_message_preview = COALESCE(NULLIF(EXCLUDED.last_message_preview, ''), conversations.last_message_preview),
          updated_at = NOW()
      `, [
        convId,
        accountId,
        convData.threadId,
        convData.type,
        convData.lastMsg.timestampIso,
        convData.lastMsg.text.slice(0, 200),
      ]).catch(() => undefined);
      updatedConversations++;
    }

    const durationMs = Date.now() - startTime;
    this.logger.info('indexeddb_import_finished', {
      accountId,
      totalMessages,
      insertedMessages,
      updatedConversations,
      durationMs,
    });

    return {
      accountId,
      totalThreads: dump.threads.length,
      totalMessages,
      insertedMessages,
      updatedConversations,
      durationMs,
    };
  }
}
