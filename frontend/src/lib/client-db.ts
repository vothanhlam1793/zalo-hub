import type { Contact, ConversationSummary, Group, Message } from '../types';
import { chatSession, conversationKey } from '../features/chat/model/chat-session';
import type { StoredComposer } from '../features/chat/model/composer-types';

// v1 had no trustworthy system-user ownership. Discard it rather than relabel it.
let opening: Promise<IDBDatabase> | undefined;
function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('No IndexedDB'));
  return opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('zalohub_local_v1', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      db.createObjectStore('cache');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onblocked = () => { opening = undefined; reject(new Error('Cache upgrade blocked')); };
  });
}

async function read<T>(key: string, fallback: T, strict = false): Promise<T> {
  const session = chatSession.capture();
  try {
    const db = await getDb();
    if (!chatSession.valid(session)) return fallback;
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('cache');
      const request = tx.objectStore('cache').get(key);
      request.onsuccess = () => resolve(chatSession.valid(session) ? request.result ?? fallback : fallback);
      request.onerror = tx.onabort = () => strict ? reject(new Error('Durable recovery unavailable')) : resolve(fallback);
    });
  } catch (error) { if (strict) throw error; return fallback; }
}

function serializable(messages: Message[]): Message[] {
  return messages.map((m) => ({ ...m,
    imageUrl: m.imageUrl?.startsWith('blob:') ? undefined : m.imageUrl,
    attachments: m.attachments.map((a) => ({ ...a,
      url: a.url?.startsWith('blob:') ? undefined : a.url,
      thumbnailUrl: a.thumbnailUrl?.startsWith('blob:') ? undefined : a.thumbnailUrl,
    })),
  }));
}

const writeVersions = new Map<string, number>();
async function write(key: string, value: unknown): Promise<boolean> {
  const session = chatSession.capture();
  const version = (writeVersions.get(key) || 0) + 1;
  writeVersions.set(key, version);
  try {
    const db = await getDb();
    if (!chatSession.valid(session)) return false;
    if (writeVersions.get(key) !== version) return false;
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    });
  } catch { return false; /* Cache is optional, including quota/private-mode failures. */ }
}
const accountKey = (kind: string, account: string) => JSON.stringify([chatSession.capture().userId, kind, account]);
const messageKey = (account: string, conversation: string) => conversationKey(chatSession.capture().userId, account, conversation);
function ownsComposerKey(key: string) {
  try { const tuple = JSON.parse(key); return Array.isArray(tuple) && tuple.length === 3 && Boolean(tuple[0]) && tuple[0] === chatSession.capture().userId; }
  catch { return false; }
}

export const PRESENTATION_CACHE_VERSION = 1;
type MessageSnapshot = { presentationVersion: number; messages: Message[] };
/** Legacy history must be fetched again, but unresolved local intents are never discarded. */
export function readMessageSnapshot(value: MessageSnapshot | Message[] | undefined): Message[] {
  if (!value) return [];
  const rows = Array.isArray(value) ? value : value.messages;
  return !Array.isArray(value) && value.presentationVersion === PRESENTATION_CACHE_VERSION
    ? rows : rows.filter(m => m.delivery && m.delivery !== 'sent');
}
export function createMessageSnapshot(messages: Message[]): MessageSnapshot {
  const recent = new Set(messages.slice(-50));
  return { presentationVersion: PRESENTATION_CACHE_VERSION,
    messages: serializable(messages.filter(m => recent.has(m) || (m.delivery && m.delivery !== 'sent'))) };
}

export const clientDb = {
  async getMessages(account: string, conversation: string, limit = 50, before?: string): Promise<Message[]> {
    const rows = readMessageSnapshot(await read<MessageSnapshot | Message[]>(messageKey(account, conversation), []));
    const history = rows.filter((m) => !before || m.timestamp < before).slice(-limit);
    // Unresolved intents must not disappear behind the history page limit.
    return before ? history : rows.filter((m) => history.includes(m) || (m.delivery && m.delivery !== 'sent'));
  },
  saveMessages: (account: string, conversation: string, messages: Message[]) => {
    // Only cache the newest 50 messages per conversation in IndexedDB to avoid storage bloat
    return write(messageKey(account, conversation), createMessageSnapshot(messages));
  },
  getConversations: (account: string) => read<ConversationSummary[]>(accountKey('conversations', account), []),
  saveConversations: (account: string, rows: ConversationSummary[]) => {
    // Cap cached conversation summaries to top 150 to keep IndexedDB footprint lean
    const capped = rows.slice(0, 150);
    return write(accountKey('conversations', account), capped);
  },
  getContacts: (account: string) => read<Contact[]>(accountKey('contacts', account), []),
  saveContacts: (account: string, rows: Contact[]) => write(accountKey('contacts', account), rows),
  getGroups: (account: string) => read<Group[]>(accountKey('groups', account), []),
  saveGroups: (account: string, rows: Group[]) => write(accountKey('groups', account), rows),
  getDraft: (key: string, strict = false) => ownsComposerKey(key) ? read<(Partial<StoredComposer> & { text: string; fileName?: string }) | null>(`draft:${key}`, null, strict) : Promise.resolve(null),
  getRecoveryMessages: async (key: string) => {
    if (!ownsComposerKey(key)) throw new Error('Invalid recovery owner');
    return readMessageSnapshot(await read<MessageSnapshot | Message[]>(key, [], true));
  },
  saveDraft: (key: string, draft: { text: string; fileName?: string }) => write(`draft:${key}`, draft),
  saveComposer: (key: string, draft: StoredComposer) => ownsComposerKey(key) ? write(`draft:${key}`, draft) : Promise.resolve(false),
  getQuickReplies: (key: string) => ownsComposerKey(key) ? read<string[]>(`draft:${key}:replies`, []) : Promise.resolve([] as string[]),
  saveQuickReplies: (key: string, replies: string[]) => ownsComposerKey(key) ? write(`draft:${key}:replies`, replies) : Promise.resolve(false),
  async getPendingConversations(): Promise<Array<{ key: string; messages: Message[] }>> {
    const session = chatSession.capture();
    try {
      const db = await getDb();
      if (!chatSession.valid(session)) return [];
      return await new Promise((resolve) => {
        const tx = db.transaction('cache');
        const request = tx.objectStore('cache').openCursor();
        const result: Array<{ key: string; messages: Message[] }> = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          try {
            const key = String(cursor.key);
            const parts = JSON.parse(key);
            const value = cursor.value;
            if (!Array.isArray(value) && !Array.isArray(value?.messages)) { cursor.continue(); return; }
            const messages = readMessageSnapshot(value);
            if (parts[0] === session.userId && messages.some((m) => m.delivery && m.delivery !== 'sent')) result.push({ key, messages });
          } catch { /* Not a message cache key. */ }
          cursor.continue();
        };
        tx.oncomplete = () => resolve(chatSession.valid(session) ? result : []);
        tx.onerror = tx.onabort = () => resolve([]);
      });
    } catch { return []; }
  },
  async clearUser(user: string) {
    if (!user) return;
    try {
      const db = await getDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction('cache', 'readwrite');
        const request = tx.objectStore('cache').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          // Outbox identities are durable user-scoped intent, not disposable history.
          // Keep them across logout; ownsComposerKey still gates every read/write.
          if (String(cursor.key).startsWith('draft:') && (cursor.value?.batch || cursor.value?.outbox?.length)) {
            cursor.continue(); return;
          }
          const key = String(cursor.key).replace(/^draft:/, '');
          try { if (JSON.parse(key)[0] === user) cursor.delete(); } catch { cursor.delete(); }
          cursor.continue();
        };
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      });
    } catch { /* Optional cache. */ }
  },
};
chatSession.subscribe((oldUser) => { writeVersions.clear(); void clientDb.clearUser(oldUser); });
