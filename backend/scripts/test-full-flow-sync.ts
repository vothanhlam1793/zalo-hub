import { chromium } from 'playwright';
import qrcodeTerminal from 'qrcode-terminal';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

async function main() {
  console.log('================================================================');
  console.log('🧪 TEST TOÀN DIỆN: QR LOGIN -> CLICK ĐỒNG BỘ -> STREAM 14 NGÀY');
  console.log('================================================================\n');

  const userDataDir = '/tmp/sync-full-flow/browser-profile';
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await context.newPage();

  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('sync') || u.includes('transfer') || u.includes('download')) {
      console.log(`📡 [NETWORK] ${res.status()} ${u.split('?')[0]}`);
    }
  });

  console.log('1️⃣ Đang tải https://chat.zalo.me/ ...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 35_000 });

  console.log('2️⃣ Đang dò tìm và xuất mã QR...');
  await page.waitForSelector('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas', { timeout: 15_000 });
  const qrEl = page.locator('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas').first();
  const qrBuf = await qrEl.screenshot({ type: 'png' });

  fs.writeFileSync('/tmp/sync-full-flow/qr.png', qrBuf);

  const png = PNG.sync.read(qrBuf);
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (code?.data) {
    console.log('\n======================================================');
    console.log('📲 QUÉT MÃ QR NÀY TRÊN APP ZALO ĐIỆN THOẠI:');
    console.log('======================================================\n');
    qrcodeTerminal.generate(code.data, { small: true });
    console.log('\nRaw QR:', code.data);
  } else {
    console.log('⚠️ Không decode được text từ QR, vui lòng xem ảnh tại /tmp/sync-full-flow/qr.png');
  }

  console.log('\n3️⃣ Chờ quét QR (tối đa 180s)...');
  const startWait = Date.now();
  let loggedIn = false;
  while (Date.now() - startWait < 180_000) {
    const url = page.url();
    if (!url.includes('id.zalo.me') && !url.includes('login') && url.includes('chat.zalo.me')) {
      loggedIn = true;
      console.log('\n🎉 ĐÃ ĐĂNG NHẬP THÀNH CÔNG VÀO GIAO DIỆN CHAT!');
      break;
    }
    await page.waitForTimeout(1500);
  }

  if (!loggedIn) {
    console.log('❌ Hết thời gian chờ quét QR.');
    await context.close();
    return;
  }

  // Đợi Zalo Web load các component
  await page.waitForTimeout(3000);

  // 4️⃣ Tự động bấm nút "Đồng bộ" trên sidebar Zalo Web để gửi Push về điện thoại
  console.log('\n4️⃣ Kích hoạt yêu cầu đồng bộ từ Zalo Web sang điện thoại...');
  const syncBtn = page.locator('.sync-v2-ok, .suggestNewSync, div:text-is("Đồng bộ"), span:text-is("Đồng bộ ngay")').first();
  if (await syncBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await syncBtn.click({ force: true });
    console.log('👉 Đã click nút Đồng bộ trên Zalo Web!');
  } else {
    console.log('ℹ️ Click fallback qua evaluate...');
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach((el) => {
        if (el.textContent?.trim() === 'Đồng bộ' || el.textContent?.trim() === 'Đồng bộ ngay') {
          (el as HTMLElement).click();
        }
      });
    });
  }

  await page.waitForTimeout(2000);
  console.log('\n======================================================');
  console.log('📱 YÊU CẦU ĐỒNG BỘ ĐÃ GỬI ĐẾN ĐIỆN THOẠI!');
  console.log('👉 VUI LÒNG BẤM "ĐỒNG BỘ NGAY" TRÊN MÀN HÌNH ĐIỆN THOẠI');
  console.log('======================================================\n');

  // 5️⃣ Theo dõi IndexedDB
  let targetDb = '';
  let maxMessages = 0;
  let maxConversations = 0;

  for (let round = 1; round <= 30; round++) {
    await page.waitForTimeout(3000);

    const stats = await page.evaluate(async (curDb: string) => {
      let dbName = curDb;
      if (!dbName && window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        const found = dbs.find((d) => d.name && d.name.startsWith('zdb_'));
        if (found?.name) dbName = found.name;
      }
      if (!dbName) {
        const myId = localStorage.getItem('my_id') || localStorage.getItem('last_uid');
        if (myId) dbName = `zdb_${myId}`;
      }

      if (!dbName) return { dbName: '', messages: 0, conversations: 0, friends: 0, groups: 0 };

      return new Promise<{ dbName: string; messages: number; conversations: number; friends: number; groups: number }>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => resolve({ dbName, messages: 0, conversations: 0, friends: 0, groups: 0 });
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const stores = Array.from(db.objectStoreNames) as string[];
          const counts: Record<string, number> = {};
          const needed = ['message', 'conversation', 'friend', 'group'].filter((s) => stores.includes(s));
          if (needed.length === 0) {
            db.close();
            return resolve({ dbName, messages: 0, conversations: 0, friends: 0, groups: 0 });
          }
          const tx = db.transaction(needed, 'readonly');
          let pending = needed.length;
          for (const s of needed) {
            const cr = tx.objectStore(s).count();
            cr.onsuccess = () => {
              counts[s] = cr.result;
              if (--pending === 0) {
                db.close();
                resolve({
                  dbName,
                  messages: counts['message'] || 0,
                  conversations: counts['conversation'] || 0,
                  friends: counts['friend'] || 0,
                  groups: counts['group'] || 0,
                });
              }
            };
            cr.onerror = () => {
              if (--pending === 0) {
                db.close();
                resolve({
                  dbName,
                  messages: counts['message'] || 0,
                  conversations: counts['conversation'] || 0,
                  friends: counts['friend'] || 0,
                  groups: counts['group'] || 0,
                });
              }
            };
          }
        };
      });
    }, targetDb);

    if (stats.dbName) targetDb = stats.dbName;
    if (stats.messages > maxMessages) maxMessages = stats.messages;
    if (stats.conversations > maxConversations) maxConversations = stats.conversations;

    console.log(`[T+${round * 3}s] DB: ${targetDb} | 💬 Messages: ${stats.messages.toLocaleString()} | 👥 Conversations: ${stats.conversations} | 👤 Friends: ${stats.friends} | 👥 Groups: ${stats.groups}`);

    if (stats.messages > 1000 && round >= 8) {
      console.log('\n🎉 DỮ LIỆU ĐÃ ĐỔ VỀ ĐẦY ĐỦ THÀNH CÔNG!');
      break;
    }
  }

  console.log(`\n======================================================`);
  console.log(`🏆 KẾT QUẢ THỬ NGHIỆM:`);
  console.log(`- Tổng số tin nhắn: ${maxMessages.toLocaleString()}`);
  console.log(`- Tổng số cuộc hội thoại: ${maxConversations}`);
  console.log(`======================================================`);

  await page.screenshot({ path: '/tmp/sync-full-flow/final-screen.png' });
  await context.close();
}

main().catch(console.error);
