import type { Contact, ConversationSummary, Group, Message } from '../types';

const DB_NAME = 'zalohub_local_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Store messages: key is message ID
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('accountId', 'accountId', { unique: false });
        messageStore.createIndex('conversationId', 'conversationId', { unique: false });
        messageStore.createIndex('account_conversation', ['accountId', 'conversationId'], { unique: false });
        messageStore.createIndex('account_conversation_time', ['accountId', 'conversationId', 'timestamp'], { unique: false });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 2. Store conversations
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: ['accountId', 'id'] });
        convStore.createIndex('accountId', 'accountId', { unique: false });
        convStore.createIndex('lastMessageTimestamp', 'lastMessageTimestamp', { unique: false });
      }

      // 3. Store contacts & groups
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: ['accountId', 'userId'] });
      }
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: ['accountId', 'groupId'] });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

export const clientDb = {
  // --- MESSAGES ---
  async getMessages(accountId: string, conversationId: string, limit = 50, beforeTimestamp?: string): Promise<Message[]> {
    try {
      const db = await getDb();
      return new Promise<Message[]>((resolve) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('account_conversation_time');

        let range: IDBKeyRange;
        if (beforeTimestamp) {
          range = IDBKeyRange.bound(
            [accountId, conversationId, ''],
            [accountId, conversationId, beforeTimestamp],
            false,
            true,
          );
        } else {
          range = IDBKeyRange.bound(
            [accountId, conversationId, ''],
            [accountId, conversationId, '\uffff'],
            false,
            false,
          );
        }

        const request = index.openCursor(range, 'prev'); // Most recent first
        const results: Message[] = [];

        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            // Sort ascending by timestamp for chat display
            results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            resolve(results);
          }
        };

        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async saveMessages(accountId: string, conversationId: string, messages: Message[]): Promise<void> {
    if (!messages.length) return;
    try {
      const db = await getDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');

        for (const msg of messages) {
          const item = {
            ...msg,
            accountId,
            conversationId: msg.conversationId || conversationId,
          };
          store.put(item);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-fatal
    }
  },

  // --- CONVERSATIONS ---
  async getConversations(accountId: string): Promise<ConversationSummary[]> {
    try {
      const db = await getDb();
      return new Promise<ConversationSummary[]>((resolve) => {
        const tx = db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const index = store.index('accountId');
        const request = index.getAll(IDBKeyRange.only(accountId));

        request.onsuccess = () => {
          const list = (request.result || []) as ConversationSummary[];
          list.sort((a, b) => (b.lastMessageTimestamp || '').localeCompare(a.lastMessageTimestamp || ''));
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async saveConversations(accountId: string, conversations: ConversationSummary[]): Promise<void> {
    if (!conversations.length) return;
    try {
      const db = await getDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');

        for (const conv of conversations) {
          store.put({ ...conv, accountId });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-fatal
    }
  },

  // --- CONTACTS & GROUPS ---
  async getContacts(accountId: string): Promise<Contact[]> {
    try {
      const db = await getDb();
      return new Promise<Contact[]>((resolve) => {
        const tx = db.transaction('contacts', 'readonly');
        const store = tx.objectStore('contacts');
        const request = store.getAll();
        request.onsuccess = () => {
          const list = (request.result || []).filter((c: any) => c.accountId === accountId);
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async saveContacts(accountId: string, contacts: Contact[]): Promise<void> {
    if (!contacts.length) return;
    try {
      const db = await getDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('contacts', 'readwrite');
        const store = tx.objectStore('contacts');
        for (const c of contacts) {
          store.put({ ...c, accountId });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-fatal
    }
  },

  async getGroups(accountId: string): Promise<Group[]> {
    try {
      const db = await getDb();
      return new Promise<Group[]>((resolve) => {
        const tx = db.transaction('groups', 'readonly');
        const store = tx.objectStore('groups');
        const request = store.getAll();
        request.onsuccess = () => {
          const list = (request.result || []).filter((g: any) => g.accountId === accountId);
          resolve(list);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async saveGroups(accountId: string, groups: Group[]): Promise<void> {
    if (!groups.length) return;
    try {
      const db = await getDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('groups', 'readwrite');
        const store = tx.objectStore('groups');
        for (const g of groups) {
          store.put({ ...g, accountId });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-fatal
    }
  },
};
