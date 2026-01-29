/**
 * 💾 MESSAGE CACHE SERVICE
 * Offline-first message storage using IndexedDB
 * Ensures messages are available even when server is down
 */

const DB_NAME = "ReplyMessagesDB";
const DB_VERSION = 1;
const STORE_NAME = "messages";

class MessageCacheService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log("[MessageCache] ✅ IndexedDB initialized");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
          });
          objectStore.createIndex("conversationId", "conversationId", {
            unique: false,
          });
          objectStore.createIndex("timestamp", "timestamp", { unique: false });
          console.log("[MessageCache] 🔧 Object store created");
        }
      };
    });
  }

  /**
   * Save messages for a conversation
   */
  async saveMessages(conversationId: string, messages: any[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      messages.forEach((msg) => {
        const cacheEntry = {
          ...msg,
          conversationId,
          cachedAt: new Date().toISOString(),
        };
        store.put(cacheEntry);
      });

      transaction.oncomplete = () => {
        console.log(
          `[MessageCache] ✅ Saved ${messages.length} messages for ${conversationId}`
        );
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get cached messages for a conversation
   */
  async getMessages(conversationId: string): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("conversationId");
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        const messages = request.result.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        console.log(
          `[MessageCache] 📦 Retrieved ${messages.length} cached messages`
        );
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear cache for a specific conversation
   */
  async clearConversation(conversationId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("conversationId");
      const request = index.openCursor(conversationId);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        console.log(`[MessageCache] 🗑️ Cleared cache for ${conversationId}`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear all cached messages
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("[MessageCache] 🗑️ All cache cleared");
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const messageCacheService = new MessageCacheService();
