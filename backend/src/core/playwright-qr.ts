import { chromium, type Browser, type Page, type Cookie } from 'playwright';
import type { GoldLogger } from './logger.js';
import type { IndexedDbImporter, IndexedDbDumpResult } from './indexeddb-importer.js';

export interface QrSyncProgressUpdate {
  step: 'qr_ready' | 'waiting_phone_confirm' | 'receiving_chunks' | 'unpacking_db' | 'importing_postgres' | 'completed' | 'error';
  percent: number;
  qrCode?: string;
  current?: number;
  total?: number;
  message?: string;
  error?: string;
}

export class PlaywrightQrLogin {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private canceled = false;
  private qrImage = '';

  constructor(
    private readonly logger: GoldLogger,
    private readonly importer?: IndexedDbImporter,
  ) {}

  async start(): Promise<string> {
    this.canceled = false;
    this.qrImage = '';
    this.logger.info('playwright_qr_launching_browser');

    this.browser = await chromium.launch({
      headless: true,
      executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });

    this.page = await context.newPage();

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    this.logger.info('playwright_qr_navigating_to_login_page');
    // Direct navigation to id.zalo.me login URL for instant QR rendering
    await this.page.goto('https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });

    this.logger.info('playwright_qr_waiting_for_qr_container');

    // 1. Direct and fast search for the real QR container on id.zalo.me
    try {
      await this.page.waitForSelector('.qr-container, div.qrcode, [class*="qr-container"]', { timeout: 8000 });
      const qrContainer = this.page.locator('.qr-container, div.qrcode, [class*="qr-container"]').first();
      
      // Take instant crystal-clear snapshot of just the QR element box
      const screenshotBuffer = await qrContainer.screenshot({ type: 'png' });
      this.qrImage = screenshotBuffer.toString('base64');
      this.logger.info('playwright_qr_extracted_from_container', { len: this.qrImage.length });
    } catch (err) {
      this.logger.warn('playwright_qr_container_not_found_fallback', { error: String(err) });
    }

    // 2. Fallback: Check if there's any image or canvas
    if (!this.qrImage) {
      try {
        const img = this.page.locator('img[src*="qr"], canvas').first();
        if (await img.isVisible({ timeout: 2000 }).catch(() => false)) {
          const screenshotBuffer = await img.screenshot({ type: 'png' });
          this.qrImage = screenshotBuffer.toString('base64');
        }
      } catch {}
    }

    // 3. Last fallback: Screenshot center of page
    if (!this.qrImage) {
      const screenshot = await this.page.screenshot({ type: 'png' });
      this.qrImage = screenshot.toString('base64');
    }

    return this.qrImage;
  }

  async waitForLoginAndImport(
    timeoutMs = 180_000,
    onProgress?: (update: QrSyncProgressUpdate) => void,
  ): Promise<{ cookies: Cookie[]; accountId: string; dumpResult?: IndexedDbDumpResult }> {
    if (!this.page) throw new Error('Browser not started');

    const startTime = Date.now();
    const pollMs = 1500;

    this.logger.info('playwright_qr_polling_login', { timeoutMs });

    // Step 1: Chờ quét mã QR trên điện thoại
    let detectedCookies: Cookie[] | null = null;
    while (Date.now() - startTime < timeoutMs) {
      if (this.canceled) {
        this.logger.info('playwright_qr_login_canceled');
        throw new Error('QR login canceled');
      }

      try {
        const cookies = await this.page.context().cookies();
        const zpsid = cookies.find((c) => c.name === 'zpsid' && c.domain.includes('zalo.me'));

        if (zpsid) {
          detectedCookies = cookies;
          break;
        }

        const url = this.page.url();
        if (!url.includes('login') && !url.includes('id.zalo.me')) {
          const zpsid2 = cookies.find((c) => c.name === 'zpsid');
          if (zpsid2) {
            detectedCookies = cookies;
            break;
          }
        }
      } catch (err) {
        this.logger.info('playwright_qr_poll_error', { error: String(err) });
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    if (!detectedCookies) {
      this.logger.info('playwright_qr_login_timeout');
      throw new Error('Hết thời gian chờ quét mã QR');
    }

    // Step 2: Phát hiện Account ID
    let accountId = '';
    const zpwSek = detectedCookies.find((c) => c.name === 'zpw_sek')?.value;
    if (zpwSek) {
      const parts = zpwSek.split('.');
      if (parts.length > 1 && /^\d+$/.test(parts[1])) {
        accountId = parts[1];
      }
    }

    onProgress?.({
      step: 'waiting_phone_confirm',
      percent: 25,
      message: '📱 Đã quét QR! Vui lòng bấm "ĐỒNG BỘ NGAY" trên điện thoại để truyền dữ liệu...',
    });

    this.logger.info('playwright_qr_scanned_waiting_sync_stream', { accountId });

    // Step 3: Lắng nghe chu trình truyền Chunk và nạp IndexedDB theo trạng thái thật
    const targetDb = `zdb_${accountId}`;
    let previousCount = 0;
    let stableCountRounds = 0;
    let syncStreamStarted = false;
    const syncStreamStart = Date.now();
    const maxSyncWaitMs = 120_000;

    while (Date.now() - syncStreamStart < maxSyncWaitMs) {
      if (this.canceled) throw new Error('Đồng bộ bị hủy');

      // 1. Kiểm tra số lượng tin nhắn trong IndexedDB
      const currentCount = await this.page.evaluate(async (dbName: string) => {
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
            countReq.onsuccess = () => { db.close(); resolve(countReq.result || 0); };
            countReq.onerror = () => { db.close(); resolve(0); };
          };
        });
      }, targetDb).catch(() => 0);

      // 2. Kiểm tra văn bản/tiến trình trên UI Zalo Web
      const syncUiText = await this.page.evaluate(() => {
        const dialog = document.querySelector('div[class*="sync"], div[class*="modal"], div[class*="popup"], div[class*="progress"]');
        return dialog ? dialog.textContent?.slice(0, 100) : '';
      }).catch(() => '');

      if (currentCount > 0) {
        if (!syncStreamStarted) {
          syncStreamStarted = true;
          this.logger.info('playwright_sync_stream_active', { accountId, initialCount: currentCount });
        }

        if (currentCount > previousCount) {
          previousCount = currentCount;
          stableCountRounds = 0;
          onProgress?.({
            step: 'receiving_chunks',
            percent: Math.min(85, 30 + Math.round((currentCount / 15000) * 55)),
            current: currentCount,
            message: `⚡ Đang nhận dữ liệu từ điện thoại: Đã truyền ${currentCount.toLocaleString()} tin nhắn...`,
          });
        } else {
          // Số tin nhắn không tăng thêm
          stableCountRounds++;
          // Nếu đã nhận > 50 tin và giữ nguyên trong 4 lần lặp (8 giây) -> Điện thoại đã truyền xong toàn bộ!
          if (stableCountRounds >= 4 && currentCount > 50) {
            this.logger.info('playwright_sync_stream_finished', { accountId, totalReceived: currentCount });
            break;
          }
        }
      } else {
        // Chưa nhận được tin nào, tiếp tục nhắc bấm trên điện thoại
        onProgress?.({
          step: 'waiting_phone_confirm',
          percent: 25,
          message: syncUiText || '📱 Đang chờ điện thoại xác nhận & đóng gói dữ liệu...',
        });
      }

      await this.page.waitForTimeout(2000);
    }

    onProgress?.({
      step: 'unpacking_db',
      percent: 88,
      message: `📦 Điện thoại đã truyền xong ${previousCount.toLocaleString()} tin nhắn. Đang trích xuất toàn bộ cơ sở dữ liệu...`,
    });

    // Step 4: Trích xuất toàn bộ dữ liệu từ IndexedDB
    let dumpResult: IndexedDbDumpResult | undefined;
    if (this.importer && accountId) {
      try {
        const dump = await this.importer.dumpFromPage(this.page, accountId);
        
        onProgress?.({
          step: 'importing_postgres',
          percent: 92,
          total: dump.messages.length,
          message: `Đang nạp ${dump.messages.length.toLocaleString()} tin nhắn vào PostgreSQL ZaloHub...`,
        });

        dumpResult = await this.importer.importDumpToPostgres(accountId, dump, (prog) => {
          onProgress?.({
            step: 'importing_postgres',
            percent: Math.min(99, 90 + Math.round((prog.percent / 100) * 9)),
            current: prog.inserted,
            total: prog.total,
            message: `Đang nạp vào database: ${prog.inserted} / ${prog.total} (${prog.percent}%)...`,
          });
        });
      } catch (dumpErr) {
        this.logger.error('playwright_qr_import_failed', { accountId, error: String(dumpErr) });
      }
    }

    onProgress?.({
      step: 'completed',
      percent: 100,
      current: dumpResult?.insertedMessages,
      total: dumpResult?.totalMessages,
      message: `🎉 Đồng bộ 100% hoàn tất! Đã nạp ${dumpResult?.insertedMessages ?? previousCount} tin nhắn từ Zalo Cloud vào hệ thống.`,
    });

    return {
      cookies: detectedCookies,
      accountId,
      dumpResult,
    };
  }

  getPage(): Page | null {
    return this.page;
  }

  async cancel(): Promise<void> {
    this.canceled = true;
    try {
      await this.page?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
    } catch {}
    this.browser = null;
    this.page = null;
    this.logger.info('playwright_qr_canceled');
  }

  async cleanup(): Promise<void> {
    try {
      await this.page?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
    } catch {}
    this.browser = null;
    this.page = null;
    this.logger.info('playwright_qr_cleaned_up');
  }
}
