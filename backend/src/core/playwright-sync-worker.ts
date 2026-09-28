import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { GoldLogger } from './logger.js';
import type { IndexedDbImporter, IndexedDbDumpResult } from './indexeddb-importer.js';
import type { GoldStoredCredential } from './types.js';

export interface SyncProgressUpdate {
  step: 'connecting' | 'waiting_phone_confirm' | 'importing' | 'completed' | 'error';
  percent: number;
  current?: number;
  total?: number;
  message?: string;
  error?: string;
}

export class PlaywrightSyncWorker {
  constructor(
    private readonly importer: IndexedDbImporter,
    private readonly logger: GoldLogger,
  ) {}

  /**
   * Run headless Playwright using stored cookies, trigger sync if needed,
   * wait for IndexedDB population, and import to PostgreSQL.
   */
  async runSync(
    accountId: string,
    credential: GoldStoredCredential,
    onProgress?: (update: SyncProgressUpdate) => void,
  ): Promise<IndexedDbDumpResult> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      this.logger.info('playwright_sync_worker_start', { accountId });
      onProgress?.({
        step: 'connecting',
        percent: 10,
        message: 'Đang mở phiên kết nối Zalo Web ngầm...',
      });

      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      context = await browser.newContext({
        userAgent: credential.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
      });

      // Parse cookies from credential
      let rawCookies: any[] = [];
      try {
        rawCookies = typeof credential.cookie === 'string' ? JSON.parse(credential.cookie) : credential.cookie;
      } catch (e) {
        this.logger.error('playwright_sync_cookie_parse_failed', { accountId, error: String(e) });
      }

      // Format cookies for Playwright
      const playwrightCookies = rawCookies.map((c) => {
        let domain = c.domain || '.zalo.me';
        if (domain.startsWith('.')) domain = domain.substring(1);
        return {
          name: c.name || c.key,
          value: c.value,
          domain,
          path: c.path || '/',
          httpOnly: Boolean(c.httpOnly),
          secure: Boolean(c.secure),
          sameSite: 'Lax' as const,
        };
      });

      if (playwrightCookies.length > 0) {
        await context.addCookies(playwrightCookies);
      }

      page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      onProgress?.({
        step: 'connecting',
        percent: 20,
        message: 'Đang tải ứng dụng chat.zalo.me...',
      });

      await page.goto('https://chat.zalo.me/', {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      // Notify user to confirm on mobile if popup triggers
      onProgress?.({
        step: 'waiting_phone_confirm',
        percent: 30,
        message: 'Đang kết nối Zalo Cloud (Vui lòng bấm Đồng bộ trên điện thoại nếu có yêu cầu)...',
      });

      // Trigger sync button on Zalo Web if present
      try {
        await page.waitForTimeout(3000);
        // Try clicking any sync buttons if visible
        const syncBtn = page.locator('button:has-text("Đồng bộ ngay"), div:has-text("Đồng bộ tin nhắn")').first();
        if (await syncBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await syncBtn.click().catch(() => {});
          this.logger.info('playwright_sync_clicked_web_sync_button', { accountId });
        }
      } catch {
        // Ignore
      }

      // Poll IndexedDB for up to 25 seconds until messages are loaded
      const targetDb = `zdb_${accountId}`;
      let messageCount = 0;
      const pollStart = Date.now();

      while (Date.now() - pollStart < 25_000) {
        try {
          messageCount = await page.evaluate(async (dbName: string) => {
            return new Promise<number>((resolve) => {
              const req = indexedDB.open(dbName);
              req.onerror = () => resolve(0);
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('messages')) {
                  db.close();
                  return resolve(0);
                }
                const trx = db.transaction('messages', 'readonly');
                const store = trx.objectStore('messages');
                const countReq = store.count();
                countReq.onsuccess = () => {
                  db.close();
                  resolve(countReq.result || 0);
                };
                countReq.onerror = () => {
                  db.close();
                  resolve(0);
                };
              };
            });
          }, targetDb);

          if (messageCount > 0) {
            this.logger.info('playwright_sync_indexeddb_ready', { accountId, messageCount });
            break;
          }
        } catch {
          // Retry
        }
        await page.waitForTimeout(1500);
      }

      onProgress?.({
        step: 'importing',
        percent: 45,
        total: messageCount,
        message: `Đã trích xuất ${messageCount} tin nhắn từ Zalo Cloud. Đang đối soát và nạp vào database...`,
      });

      // Extract all data from IndexedDB
      const dump = await this.importer.dumpFromPage(page, accountId);

      // Clean up browser immediately before long SQL import
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
      browser = null;
      page = null;
      context = null;

      // Import into PostgreSQL with progress tracking
      const result = await this.importer.importDumpToPostgres(accountId, dump, (prog) => {
        onProgress?.({
          step: 'importing',
          percent: Math.min(95, 45 + Math.round((prog.percent / 100) * 50)),
          current: prog.inserted,
          total: prog.total,
          message: `Đang nạp vào cơ sở dữ liệu: ${prog.inserted} / ${prog.total} tin nhắn (${prog.percent}%)...`,
        });
      });

      onProgress?.({
        step: 'completed',
        percent: 100,
        current: result.insertedMessages,
        total: result.totalMessages,
        message: `Đồng bộ hoàn tất 100%! Đã bù đắp ${result.insertedMessages} tin nhắn mới vào ${result.updatedConversations} cuộc hội thoại.`,
      });

      return result;
    } catch (err: any) {
      this.logger.error('playwright_sync_worker_failed', { accountId, error: err?.message || String(err) });
      onProgress?.({
        step: 'error',
        percent: 0,
        error: err?.message || 'Lỗi trong quá trình đồng bộ Playwright',
        message: `Đồng bộ thất bại: ${err?.message || 'Lỗi không xác định'}`,
      });
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}
