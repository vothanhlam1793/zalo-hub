import type { Contact, ConversationSummary, Group, Message } from '../types';
import { chatSession, conversationKey } from '../features/chat/model/chat-session';

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

async function read<T>(key: string, fallback: T): Promise<T> {
  const session = chatSession.capture();
  try {
    const db = await getDb();
    if (!chatSession.valid(session)) return fallback;
    return await new Promise<T>((resolve) => {
      const tx = db.transaction('cache');
      const request = tx.objectStore('cache').get(key);
      request.onsuccess = () => resolve(chatSession.valid(session) ? request.result ?? fallback : fallback);
      request.onerror = tx.onabort = () => resolve(fallback);
    });
  } catch { return fallback; }
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
async function write(key: string, value: unknown): Promise<void> {
  const session = chatSession.capture();
  const version = (writeVersions.get(key) || 0) + 1;
  writeVersions.set(key, version);
  try {
    const db = await getDb();
    if (!chatSession.valid(session) || writeVersions.get(key) !== version) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch { /* Cache is optional, including quota/private-mode/transaction failures. */ }
}
const accountKey = (kind: string, account: string) => JSON.stringify([chatSession.capture().userId, kind, account]);
const messageKey = (account: string, conversation: string) => conversationKey(chatSession.capture().userId, account, conversation);

export const clientDb = {
  async getMessages(account: string, conversation: string, limit = 50, before?: string): Promise<Message[]> {
    const rows = await read<Message[]>(messageKey(account, conversation), []);
    const history = rows.filter((m) => !before || m.timestamp < before).slice(-limit);
    // Unresolved intents must not disappear behind the history page limit.
    return before ? history : rows.filter((m) => history.includes(m) || (m.delivery && m.delivery !== 'sent'));
  },
  saveMessages: (account: string, conversation: string, messages: Message[]) => write(messageKey(account, conversation), serializable(messages)),
  getConversations: (account: string) => read<ConversationSummary[]>(accountKey('conversations', account), []),
  saveConversations: (account: string, rows: ConversationSummary[]) => write(accountKey('conversations', account), rows),
  getContacts: (account: string) => read<Contact[]>(accountKey('contacts', account), []),
  saveContacts: (account: string, rows: Contact[]) => write(accountKey('contacts', account), rows),
  getGroups: (account: string) => read<Group[]>(accountKey('groups', account), []),
  saveGroups: (account: string, rows: Group[]) => write(accountKey('groups', account), rows),
  getDraft: (key: string) => read<{ text: string; fileName?: string } | null>(`draft:${key}`, null),
  saveDraft: (key: string, draft: { text: string; fileName?: string }) => write(`draft:${key}`, draft),
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
            const messages: Message[] = cursor.value;
            if (parts[0] === session.userId && Array.isArray(messages) && messages.some((m) => m.delivery && m.delivery !== 'sent')) result.push({ key, messages });
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
