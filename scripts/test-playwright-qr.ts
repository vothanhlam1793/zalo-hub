import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import qrcode from 'qrcode-terminal';

function decodeQrFromBase64(base64: string): string | null {
  try {
    const buf = Buffer.from(base64, 'base64');
    const png = PNG.sync.read(buf);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    return code?.data ?? null;
  } catch {
    return null;
  }
}

function extractToken(data: string): string {
  const m = data.match(/tk=([^&]+)/);
  return m ? m[1] : data.slice(-40);
}

async function extractQrData(page: any): Promise<{ data: string; source: string } | null> {
  // canvas
  try {
    const canvases = page.locator('canvas');
    const n = await canvases.count();
    for (let i = 0; i < n; i++) {
      const dataUrl = await canvases.nth(i).evaluate((el: HTMLCanvasElement) => el.toDataURL('image/png'));
      if (dataUrl?.startsWith('data:image')) {
        const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const d = decodeQrFromBase64(b64);
        if (d) return { data: d, source: `canvas[${i}]` };
      }
    }
  } catch {}
  // img
  try {
    const imgs = page.locator('img');
    const n = await imgs.count();
    for (let i = 0; i < n; i++) {
      const src = await imgs.nth(i).getAttribute('src');
      if (src?.startsWith('data:image')) {
        const b64 = src.replace(/^data:image\/\w+;base64,/, '');
        const d = decodeQrFromBase64(b64);
        if (d) return { data: d, source: `img[${i}]` };
      }
    }
  } catch {}
  return null;
}

async function renderQr(data: string) {
  await new Promise<void>((resolve) => {
    qrcode.generate(data, { small: true }, (qr: string) => {
      process.stdout.write(qr + '\n');
      resolve();
    });
  });
}

async function main() {
  console.log('\n🚀 Đang mở trình duyệt...\n');

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

  console.log('📄 Đang load chat.zalo.me...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Chờ QR xuất hiện đầu tiên
  console.log('⏳ Chờ QR đầu tiên...');
  try {
    await page.waitForSelector('div[class*="qr"], canvas, img[src*="qr"]', { timeout: 15_000 });
  } catch {
    console.log('⚠️  Không thấy QR element');
  }

  // Monitor QR thay đổi theo thời gian
  let lastToken = '';
  let stableCount = 0;
  let qrFound = false;

  const scanStart = Date.now();

  console.log('\n🔍 BẮT ĐẦU THEO DÕI QR THAY ĐỔI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Poll QR mỗi 1.5s
  while (Date.now() - scanStart < 90_000) {
    // Check login
    try {
      const cookies = await page.context().cookies();
      if (cookies.find((c: any) => c.name === 'zpsid')) {
        console.log('\n✅ ĐÃ LOGIN!');
        console.log('   Phone có hiện "Đồng bộ dữ liệu" checkbox?');
        writeFileSync('/tmp/zalo-playwright-cookies.json', JSON.stringify(cookies, null, 2));
        await new Promise((r) => setTimeout(r, 15000));
        break;
      }
    } catch {}

    const qr = await extractQrData(page);

    if (qr) {
      const newToken = extractToken(qr.data);
      const changed = newToken !== lastToken;

      if (!qrFound) {
        // Lần đầu tìm thấy QR
        qrFound = true;
        lastToken = newToken;
        console.log(`[${new Date().toISOString().slice(11, 19)}] QR ĐẦU TIÊN | src: ${qr.source}`);
        console.log(`   token: ${newToken.slice(0, 50)}...`);
        console.log('');
        await renderQr(qr.data);
        console.log('');
      } else if (changed) {
        stableCount = 0;
        console.log(`\n🔄 [${new Date().toISOString().slice(11, 19)}] QR THAY ĐỔI! | src: ${qr.source}`);
        console.log(`   token CŨ: ${lastToken.slice(0, 40)}...`);
        console.log(`   token MỚI: ${newToken.slice(0, 40)}...`);
        lastToken = newToken;
        console.log('');
        await renderQr(qr.data);
        console.log('');
      } else {
        stableCount++;
        const sec = Math.floor((Date.now() - scanStart) / 1000);
        process.stdout.write(`\r   QR ổn định (${stableCount}x) | ${sec}s`);
      }
    } else {
      const sec = Math.floor((Date.now() - scanStart) / 1000);
      process.stdout.write(`\r   chưa thấy QR | ${sec}s`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  writeFileSync('/tmp/zalo-playwright-cookies.json', JSON.stringify(await page.context().cookies(), null, 2));
  await browser.close();
  console.log('\n👋 Done!\n');
}

main().catch((err) => {
  console.error('\n💥', err.message, '\n');
  process.exit(1);
});
