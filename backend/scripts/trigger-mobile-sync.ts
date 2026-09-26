import { chromium } from 'playwright';
import knexPkg from 'knex';
import { GoldLogger } from '../src/core/logger.js';
import { IndexedDbImporter } from '../src/core/indexeddb-importer.js';

const knex = knexPkg({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
});

const logger = new GoldLogger();
const importer = new IndexedDbImporter(knex, logger);

async function main() {
  const accountId = process.argv[2] || '2223644954053185337';
  console.log(`\n🚀 BẮT ĐẦU TEST KÍCH HOẠT ĐỒNG BỘ CHO NICK: ${accountId}\n`);

  const sessionRow = await knex('account_sessions').where({ account_id: accountId }).first();
  if (!sessionRow) {
    console.error('❌ Không tìm thấy session trong database cho account:', accountId);
    process.exit(1);
  }

  const rawCookies = typeof sessionRow.cookie_json === 'string'
    ? JSON.parse(sessionRow.cookie_json)
    : sessionRow.cookie_json;

  console.log(`📦 Đã nạp ${rawCookies.length} cookies từ database...`);

  const browser = await chromium.launch({
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

  const context = await browser.newContext({
    userAgent: sessionRow.user_agent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  const playwrightCookies = rawCookies.map((c: any) => {
    let domain = c.domain || '.zalo.me';
    if (domain.startsWith('.')) domain = domain.substring(1);
    return {
      name: c.name || c.key,
      value: String(c.value),
      domain: domain,
      path: c.path || '/',
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: (c.sameSite === 'none' ? 'None' : c.sameSite === 'strict' ? 'Strict' : 'Lax') as any,
    };
  });

  await context.addCookies(playwrightCookies);
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('🌐 Đang mở chat.zalo.me...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log('📍 Current URL:', currentUrl);

  // Tìm và khảo sát các đối tượng trigger sync trên Zalo Web
  console.log('🔍 Đang kiểm tra đối tượng Zalo Web Sync trên trang...');
  const syncInfo = await page.evaluate(() => {
    const res: any = {
      hasZaloApp: Boolean((window as any).ZaloApp || (window as any).__ZALO_APP__),
      buttonsFound: [],
      syncObjects: [],
    };

    // Tìm tất cả các nút có từ khoá liên quan
    document.querySelectorAll('button, div, span, a').forEach((el) => {
      const text = el.textContent || '';
      if (text.includes('Đồng bộ') || text.includes('sao lưu') || text.includes('tin nhắn')) {
        res.buttonsFound.push({
          tag: el.tagName,
          text: text.slice(0, 50).trim(),
          classes: el.className,
        });
      }
    });

    return res;
  });

  console.log('📊 Thông tin phát hiện trên trang:', JSON.stringify(syncInfo, null, 2));

  // Thử click bất kỳ nút trigger đồng bộ nào nếu có
  const syncBtn = page.locator('button:has-text("Đồng bộ"), div:has-text("Đồng bộ"), span:has-text("Đồng bộ")').first();
  if (await syncBtn.isVisible().catch(() => false)) {
    console.log('👉 Tìm thấy nút Đồng bộ, đang click...');
    await syncBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
  }

  // Chờ và kiểm tra IndexedDB
  const targetDb = `zdb_${accountId}`;
  console.log(`⏳ Đang theo dõi IndexedDB "${targetDb}" trong 15 giây...`);

  let count = 0;
  for (let i = 0; i < 10; i++) {
    count = await page.evaluate(async (dbName) => {
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
          const c = store.count();
          c.onsuccess = () => { db.close(); resolve(c.result || 0); };
          c.onerror = () => { db.close(); resolve(0); };
        };
      });
    }, targetDb);

    console.log(`   [${i + 1}/10] Số tin nhắn trong IndexedDB: ${count}`);
    if (count > 0) break;
    await page.waitForTimeout(1500);
  }

  if (count > 0) {
    console.log('\n📥 Bắt đầu dump IndexedDB nạp vào PostgreSQL...');
    const dump = await importer.dumpFromPage(page, accountId);
    const result = await importer.importDumpToPostgres(accountId, dump, (p) => {
      console.log(`   Đối soát: ${p.inserted}/${p.total} (${p.percent}%)`);
    });
    console.log('\n✅ KẾT QUẢ ĐỐI SOÁT:', result);
  } else {
    console.log('⚠️ Chưa có dữ liệu mới trong IndexedDB');
  }

  await page.screenshot({ path: '/tmp/zalo-sync-debug.png' });
  console.log('📸 Đã chụp màn hình debug tại /tmp/zalo-sync-debug.png');

  await browser.close();
  await knex.destroy();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
