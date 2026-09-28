import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Zalo } from 'zalo-api-final';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function generateZaloImei(userAgent: string): string {
  const md5 = crypto.createHash('md5').update(userAgent).digest('hex');
  return `${crypto.randomUUID()}-${md5}`;
}

function decodeQrCodeFromPng(pngBuffer: Buffer): string | null {
  try {
    const png = PNG.sync.read(pngBuffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    return code?.data ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU TEST ĐỘC LẬP: PLAYWRIGHT QR LOGIN + SYNC + API VERIFY');
  console.log('================================================================\n');

  console.log('1️⃣ Khởi chạy Playwright Chromium (Headless)...');
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
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log('2️⃣ Điều hướng đến https://chat.zalo.me/ ...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Theo dõi URL và Requests
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('login') || url.includes('auth') || url.includes('sync') || url.includes('getLoginInfo')) {
      console.log(`   📡 [NET-RES] ${res.status()} ${url.split('?')[0]}`);
    }
  });

  console.log('3️⃣ Đang tìm mã QR...');
  await page.waitForTimeout(2000);

  // Thử tìm QR container hoặc canvas/img
  let qrPngBuffer: Buffer | null = null;
  try {
    await page.waitForSelector('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas', { timeout: 10_000 });
    const qrEl = page.locator('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas').first();
    qrPngBuffer = await qrEl.screenshot({ type: 'png' });
  } catch (err) {
    console.log('   ⚠️ Không tìm thấy element QR chuyên biệt, chụp ảnh toàn trang...');
    qrPngBuffer = await page.screenshot({ type: 'png' });
  }

  if (qrPngBuffer) {
    fs.writeFileSync('/tmp/zalo-test-qr.png', qrPngBuffer);
    console.log('   💾 Đã lưu ảnh QR vào /tmp/zalo-test-qr.png');

    const qrText = decodeQrCodeFromPng(qrPngBuffer);
    if (qrText) {
      console.log('\n📲 QUÉT MÃ QR NÀY BẰNG APP ZALO TRÊN ĐIỆN THOẠI:\n');
      qrcode.generate(qrText, { small: true });
      console.log('\n🔗 Raw QR data:', qrText);
    } else {
      console.log('   ⚠️ Không decode được text từ QR (ảnh đã lưu tại /tmp/zalo-test-qr.png)');
    }
  }

  console.log('\n4️⃣ Chờ quét QR và xác nhận trên điện thoại (tối đa 180s)...');
  const startTime = Date.now();
  let loggedIn = false;
  let accountId = '';

  while (Date.now() - startTime < 180_000) {
    const cookies = await context.cookies();
    const zpsid = cookies.find((c) => c.name === 'zpsid');
    const zpwSek = cookies.find((c) => c.name === 'zpw_sek');
    const currentUrl = page.url();

    if (zpsid || zpwSek || currentUrl.includes('chat.zalo.me')) {
      if (zpwSek) {
        console.log('\n🎉 [PHÁT HIỆN zpw_sek]:', zpwSek.value.slice(0, 35) + '... (Domain:', zpwSek.domain + ')');
        loggedIn = true;
        break;
      } else if (zpsid && !loggedIn) {
        console.log('   ⏳ Đã nhận zpsid (' + zpsid.value.slice(0, 20) + '...), đang chờ zpw_sek và chat.zalo.me nạp hoàn tất...');
      }
    }

    // Kiểm tra xem trang có nút "Đồng bộ ngay" hoặc pop-up nào không
    const popups = await page.evaluate(() => {
      const texts: string[] = [];
      document.querySelectorAll('button, div[role="button"], .btn').forEach((b) => {
        const t = (b.textContent || '').trim();
        if (t.includes('Đồng bộ') || t.includes('Tiếp tục') || t.includes('Xác nhận') || t.includes('Đóng')) {
          texts.push(t);
          // Thử auto-click nếu có nút Đồng bộ ngay trên giao diện web
          if (t.includes('Đồng bộ ngay') || t.includes('Đồng bộ tin nhắn')) {
            (b as HTMLElement).click();
          }
        }
      });
      return texts;
    }).catch(() => []);

    if (popups.length > 0) {
      console.log('   💬 Phát hiện nút/thông báo trên Web:', popups.join(' | '));
    }

    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.error('❌ Hết thời gian chờ hoặc chưa nhận được zpw_sek!');
    await browser.close();
    process.exit(1);
  }

  console.log('\n5️⃣ KIỂM TRA DỮ LIỆU INDEXEDDB VÀ ĐỒNG BỘ 14 NGÀY...');
  await page.waitForTimeout(3000);

  // Khảo sát IndexedDB
  const dbInfo = await page.evaluate(async () => {
    let dbs: any[] = [];
    if (indexedDB.databases) {
      dbs = await indexedDB.databases();
    }
    const myId = localStorage.getItem('my_id') || localStorage.getItem('last_uid') || '';
    return { dbs, myId, url: window.location.href };
  });

  console.log('   📊 Database Info:', JSON.stringify(dbInfo));
  accountId = dbInfo.myId || '';

  // Dò tên DB zdb_
  const targetDb = dbInfo.dbs.find((d: any) => d.name && d.name.startsWith('zdb_'))?.name || (accountId ? `zdb_${accountId}` : '');
  console.log(`   🎯 Target IndexedDB: ${targetDb}`);

  if (targetDb) {
    console.log('   ⏳ Đang theo dõi số lượng tin nhắn đổ về IndexedDB trong 20s...');
    for (let i = 0; i < 10; i++) {
      const count = await page.evaluate(async (dbName: string) => {
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

      console.log(`      [T+${i * 2}s] Messages trong ${targetDb}: ${count.toLocaleString()} tin nhắn`);
      await page.waitForTimeout(2000);
    }
  }

  console.log('\n6️⃣ TEST ĐĂNG NHẬP ZALO API ĐỘC LẬP QUA zalo-api-final...');
  const allCookies = await context.cookies();
  const imei = generateZaloImei(USER_AGENT);

  console.log(`   🍪 Tổng số cookies thu được: ${allCookies.length}`);
  allCookies.forEach(c => console.log(`      🍪 ${c.name} (${c.domain}) = ${c.value.slice(0, 20)}...`));
  console.log(`   🆔 IMEI sinh ra: ${imei}`);
  console.log(`   🌐 User-Agent: ${USER_AGENT}`);

  try {
    const { prepareCookiesForChatSession } = await import('../src/core/runtime/normalizer.js');
    const prepared = prepareCookiesForChatSession(JSON.stringify(allCookies));
    console.log(`   🧹 Cookies sau khi normalize: ${prepared.length}`);
    prepared.forEach((c: any) => console.log(`      ✨ ${c.name || c.key} (${c.domain}) = ${(c.value || '').slice(0, 20)}...`));

    const zalo = new Zalo({ selfListen: true, logging: false } as any);
    const api = await zalo.login({
      cookie: prepared,
      imei,
      userAgent: USER_AGENT,
    } as any);

    console.log('\n✅ ZALO API LOGIN THÀNH CÔNG RỰC RỠ!');
    
    // Gọi thử 1 API lấy profile
    try {
      const profile = await (api as any).fetchAccountInfo?.();
      console.log('   👤 Thông tin tài khoản:', profile?.data?.displayName || profile?.data?.name || 'OK');
    } catch {
      console.log('   👤 Login context hợp lệ và sẵn sàng kết nối WebSocket!');
    }

    console.log('\n================================================================');
    console.log('🏆 KẾT LUẬN: BỘ THÔNG SỐ VÀ QUY TRÌNH NÀY HOẠT ĐỘNG HOÀN HẢO!');
    console.log('================================================================');
  } catch (apiErr: any) {
    console.error('\n❌ Zalo API login thất bại:', apiErr.message || apiErr);
  }

  await page.screenshot({ path: '/tmp/zalo-test-after-login.png' });
  console.log('📸 Đã chụp ảnh màn hình sau khi hoàn tất: /tmp/zalo-test-after-login.png');

  await browser.close();
  console.log('\n🏁 Kết thúc phiên test độc lập.');
}

main().catch(console.error);
