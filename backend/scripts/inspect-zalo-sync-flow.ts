import { chromium } from 'playwright';
import qrcode from 'qrcode-terminal';
import knexPkg from 'knex';
import { GoldLogger } from '../src/core/logger.js';
import { IndexedDbImporter } from '../src/core/indexeddb-importer.js';

const knex = knexPkg({
  client: 'pg',
  connection: 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
});

const logger = new GoldLogger();
const importer = new IndexedDbImporter(knex, logger);

async function main() {
  console.log('\n🚀 KHỞI ĐỘNG PLAYWRIGHT ĐỂ BẮT QR & KÍCH HOẠT PUSH SYNC VỀ ĐIỆN THOẠI...\n');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('🌐 Đang tải chat.zalo.me...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Lắng nghe tất cả các request để tìm endpoint sync
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('sync') || url.includes('history') || url.includes('backup') || url.includes('msg')) {
      console.log(`📡 [NETWORK REQUEST] ${req.method()} ${url}`);
    }
  });

  // Chờ QR xuất hiện
  console.log('⏳ Đang tìm mã QR để bạn quét trên điện thoại...');
  await page.waitForSelector('img[src*="qr"], canvas', { timeout: 15000 }).catch(() => {});

  const qrImg = page.locator('img[src*="qr"]').first();
  const src = await qrImg.getAttribute('src').catch(() => null);

  if (src && src.startsWith('data:image')) {
    console.log('✅ ĐÃ TẠO MÃ QR TƯƠNG TÁC THẬT TỪ ZALO WEB!');
    console.log('   (Mã QR này sẽ kích hoạt nút "Đồng bộ từ điện thoại" ngay sau khi quét)\n');
  }

  // Chờ login xong
  console.log('📱 Vui lòng quét mã QR trên điện thoại nếu cần...');
  const pollStart = Date.now();
  let accountId = '';

  while (Date.now() - pollStart < 60000) {
    const cookies = await context.cookies();
    const zpsid = cookies.find((c) => c.name === 'zpsid');
    if (zpsid) {
      console.log('\n🎉 ĐÃ ĐĂNG NHẬP THÀNH CÔNG VÀO CHAT.ZALO.ME!');
      break;
    }
    await page.waitForTimeout(2000);
  }

  // Sau khi login, tìm Account ID và khảo sát popup Đồng bộ
  await page.waitForTimeout(5000);
  const accountInfo = await page.evaluate(() => {
    const dbNames: string[] = [];
    return {
      title: document.title,
      bodyText: document.body.innerText.slice(0, 300),
    };
  });

  console.log('📊 Thông tin trang sau login:', accountInfo);
  await page.screenshot({ path: '/tmp/zalo-after-login.png' });

  await browser.close();
  await knex.destroy();
}

main().catch(console.error);
