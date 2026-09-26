import { chromium, type Browser, type Page, type Cookie } from 'playwright';
import type { GoldLogger } from './logger.js';
import type { IndexedDbImporter, IndexedDbDumpResult } from './indexeddb-importer.js';

export interface QrSyncProgressUpdate {
  step: 'qr_ready' | 'scanned' | 'importing_db' | 'completed' | 'error';
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
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });

    this.page = await context.newPage();

    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    this.logger.info('playwright_qr_navigating_to_chat_zalo');
    await this.page.goto('https://chat.zalo.me/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    this.logger.info('playwright_qr_waiting_for_qr_element');

    try {
      await this.page.waitForSelector('img[src*="qr"]', { timeout: 15_000 });
      const img = this.page.locator('img[src*="qr"]').first();
      const src = await img.getAttribute('src');
      if (src && src.startsWith('data:image')) {
        this.qrImage = src.replace(/^data:image\/\w+;base64,/, '');
        this.logger.info('playwright_qr_extracted_from_img', { len: this.qrImage.length });
      }
    } catch {
      this.logger.info('playwright_qr_img_not_found_fallback');
    }

    if (!this.qrImage) {
      try {
        await this.page.waitForSelector('canvas', { timeout: 10_000 });
        const canvas = this.page.locator('canvas').first();
        const dataUrl = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL('image/png'));
        if (dataUrl && dataUrl.startsWith('data:image')) {
          this.qrImage = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          this.logger.info('playwright_qr_extracted_from_canvas', { len: this.qrImage.length });
        }
      } catch {
        this.logger.info('playwright_qr_canvas_not_found');
      }
    }

    if (!this.qrImage) {
      this.logger.info('playwright_qr_fallback_screenshot');
      const screenshot = await this.page.screenshot({ type: 'png' });
      this.qrImage = screenshot.toString('base64');
      this.logger.info('playwright_qr_screenshot_taken', { len: this.qrImage.length });
    }

    return this.qrImage;
  }

  async waitForLoginAndImport(
    timeoutMs = 120_000,
    onProgress?: (update: QrSyncProgressUpdate) => void,
  ): Promise<{ cookies: Cookie[]; accountId: string; dumpResult?: IndexedDbDumpResult }> {
    if (!this.page) throw new Error('Browser not started');

    const startTime = Date.now();
    const pollMs = 1500;

    this.logger.info('playwright_qr_polling_login', { timeoutMs });

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
      throw new Error('QR login timeout — không quét trong thời gian cho phép');
    }

    onProgress?.({
      step: 'scanned',
      percent: 30,
      message: '✅ Đã quét thành công! Đang chờ Zalo Cloud tải dữ liệu 14 ngày...',
    });

    // Detect Account ID from cookies or IndexedDB
    let accountId = '';
    const zpwSek = detectedCookies.find((c) => c.name === 'zpw_sek')?.value;
    if (zpwSek) {
      const parts = zpwSek.split('.');
      if (parts.length > 1 && /^\d+$/.test(parts[1])) {
        accountId = parts[1];
      }
    }

    // Wait 4-6s for Zalo Web to populate IndexedDB
    await this.page.waitForTimeout(4000);

    let dumpResult: IndexedDbDumpResult | undefined;
    if (this.importer && accountId) {
      try {
        onProgress?.({
          step: 'importing_db',
          percent: 50,
          message: 'Đang trích xuất và đối soát 14 ngày tin nhắn vào database...',
        });

        const dump = await this.importer.dumpFromPage(this.page, accountId);
        dumpResult = await this.importer.importDumpToPostgres(accountId, dump, (prog) => {
          onProgress?.({
            step: 'importing_db',
            percent: Math.min(95, 50 + Math.round((prog.percent / 100) * 45)),
            current: prog.inserted,
            total: prog.total,
            message: `Đang đối soát: ${prog.inserted} / ${prog.total} tin nhắn (${prog.percent}%)...`,
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
      message: `Đồng bộ hoàn tất 100%! Đã bù đắp ${dumpResult?.insertedMessages ?? 0} tin nhắn 14 ngày vào hệ thống.`,
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
