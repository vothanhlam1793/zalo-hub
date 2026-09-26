import { chromium } from 'playwright';
import qrcodeTerminal from 'qrcode-terminal';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

async function main() {
  console.log('================================================================');
  console.log('🧪 CHẠY LẠI THỬ NGHIỆM SYNC 14 NGÀY CHUẨN TỪ ZALO WEB PERSISTENT PROFILE');
  console.log('================================================================\n');

  const userDataDir = '/tmp/sync-pilot-test-run/browser-profile';
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  console.log('1️⃣ Khởi động Chromium Persistent Context...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await context.newPage();
  console.log('2️⃣ Mở https://chat.zalo.me/ ...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 35_000 });
  await page.waitForTimeout(4000);

  console.log('3️⃣ Chụp và trích xuất mã QR...');
  const qrScreenshot = await page.screenshot({ fullPage: false });
  fs.writeFileSync('/tmp/sync-pilot-test-run/qr-page.png', qrScreenshot);

  try {
    const png = PNG.sync.read(qrScreenshot);
    const code = jsQR(new Uint8ClampedArray(png.data.buffer), png.width, png.height);
    if (code && code.data) {
      console.log('\n======================================================');
      console.log('>>> VUI LÒNG DÙNG APP ZALO QUÉT MÃ QR NÀY TRÊN TERMINAL <<<');
      console.log('======================================================\n');
      qrcodeTerminal.generate(code.data, { small: true }, (qrStr) => {
        console.log(qrStr);
      });
      console.log('Raw QR text:', code.data);
    } else {
      console.log('⚠️ Không decode được từ ảnh fullPage, tìm thẻ QR element...');
      const qrEl = page.locator('.qr-container, div.qrcode, [class*="qr-container"]').first();
      const qrBuf = await qrEl.screenshot({ type: 'png' }).catch(() => null);
      if (qrBuf) {
        const png2 = PNG.sync.read(qrBuf);
        const code2 = jsQR(new Uint8ClampedArray(png2.data.buffer), png2.width, png2.height);
        if (code2 && code2.data) {
          qrcodeTerminal.generate(code2.data, { small: true }, (qrStr) => console.log(qrStr));
        }
      }
    }
  } catch (err) {
    console.log('Lỗi decode QR:', err);
  }

  console.log('\n4️⃣ Đang chờ bạn quét mã QR và xác nhận trên điện thoại (tối đa 180s)...');
  const startWait = Date.now();
  let loggedIn = false;
  while (Date.now() - startWait < 180_000) {
    const url = page.url();
    if (!url.includes('id.zalo.me') && !url.includes('login') && url.includes('chat.zalo.me')) {
      loggedIn = true;
      console.log('\n🎉 ĐÃ ĐĂNG NHẬP THÀNH CÔNG VÀO GIAO DIỆN ZALO WEB!');
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.log('❌ Hết thời gian chờ quét QR.');
    await context.close();
    return;
  }

  // Tự động bấm nút Đồng bộ ngay trên Web nếu có
  await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a, span'));
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (text.includes('đồng bộ ngay') || text.includes('đồng bộ tin nhắn') || text.includes('đồng bộ')) {
        (btn as HTMLElement).click();
        break;
      }
    }
  });

  console.log('\n5️⃣ THEO DÕI STREAM TIN NHẮN ĐỔ VỀ INDEXEDDB (Store "message" & "conversation")...');
  console.log('>>> Vui lòng bấm "ĐỒNG BỘ NGAY" trên điện thoại nếu có yêu cầu <<<\n');

  // Lặp theo dõi trong 60 giây
  let targetDb = '';
  for (let round = 1; round <= 20; round++) {
    await page.waitForTimeout(3000);

    const checkResult = await page.evaluate(async (currentDb: string) => {
      let dbName = currentDb;
      if (!dbName && window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        const found = dbs.find((d) => d.name && d.name.startsWith('zdb_'));
        if (found?.name) dbName = found.name;
      }

      if (!dbName) {
        const myId = localStorage.getItem('my_id') || localStorage.getItem('last_uid');
        if (myId) dbName = `zdb_${myId}`;
      }

      if (!dbName) return { dbName: '', messageCount: 0, convCount: 0, friendCount: 0, groupCount: 0 };

      return new Promise<{ dbName: string; messageCount: number; convCount: number; friendCount: number; groupCount: number }>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => resolve({ dbName, messageCount: 0, convCount: 0, friendCount: 0, groupCount: 0 });
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const stores = Array.from(db.objectStoreNames) as string[];
          const counts: Record<string, number> = {};

          const targetStores = ['message', 'conversation', 'friend', 'group'].filter((s) => stores.includes(s));
          if (targetStores.length === 0) {
            db.close();
            return resolve({ dbName, messageCount: 0, convCount: 0, friendCount: 0, groupCount: 0 });
          }

          const tx = db.transaction(targetStores, 'readonly');
          let pending = targetStores.length;
          for (const s of targetStores) {
            const cReq = tx.objectStore(s).count();
            cReq.onsuccess = () => {
              counts[s] = cReq.result;
              if (--pending === 0) {
                db.close();
                resolve({
                  dbName,
                  messageCount: counts['message'] || 0,
                  convCount: counts['conversation'] || 0,
                  friendCount: counts['friend'] || 0,
                  groupCount: counts['group'] || 0,
                });
              }
            };
            cReq.onerror = () => {
              if (--pending === 0) {
                db.close();
                resolve({
                  dbName,
                  messageCount: counts['message'] || 0,
                  convCount: counts['conversation'] || 0,
                  friendCount: counts['friend'] || 0,
                  groupCount: counts['group'] || 0,
                });
              }
            };
          }
        };
      });
    }, targetDb);

    if (checkResult.dbName) targetDb = checkResult.dbName;

    console.log(`[T+${round * 3}s] DB: ${targetDb || 'Đang chờ tạo...'} | 💬 Messages: ${checkResult.messageCount.toLocaleString()} | 👥 Conversations: ${checkResult.convCount} | 👤 Friends: ${checkResult.friendCount} | 👥 Groups: ${checkResult.groupCount}`);

    // Nếu đã nhận nhiều tin nhắn và số lượng ổn định qua nhiều lượt
    if (checkResult.messageCount > 1000 && round >= 10) {
      console.log('\n🎉 ĐÃ NHẬN ĐẦY ĐỦ TOÀN BỘ TIN NHẮN TỪ ĐIỆN THOẠI!');
      break;
    }
  }

  // Chụp ảnh kết quả
  await page.screenshot({ path: '/tmp/sync-pilot-test-run/final-chat.png' });
  console.log('\n📸 Đã lưu ảnh kết quả giao diện: /tmp/sync-pilot-test-run/final-chat.png');

  await context.close();
  console.log('=== KẾT THÚC CHẠY THỬ NGHIỆM ===');
}

main().catch(console.error);
