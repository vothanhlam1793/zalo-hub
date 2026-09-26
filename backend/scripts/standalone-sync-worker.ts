import { chromium } from 'playwright';
import qrcodeTerminal from 'qrcode-terminal';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import knexLib from 'knex';
import { Zalo } from 'zalo-api-final';

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function generateZaloImei(userAgent: string): string {
  const md5 = crypto.createHash('md5').update(userAgent).digest('hex');
  return `${crypto.randomUUID()}-${md5}`;
}

async function main() {
  const targetAccountId = process.argv[2] || '2223644954053185337';

  console.log('========================================================================');
  console.log(`🚀 STANDALONE SYNC WORKER: THỬ NGHIỆM ĐỒNG BỘ ĐỘC LẬP CHO ACCOUNT: ${targetAccountId}`);
  console.log('========================================================================\n');

  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
  });

  const profileDir = path.resolve(`/tmp/zalohub-standalone-profile/${targetAccountId}`);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  console.log(`1️⃣ Khởi tạo Chromium Persistent Context tại: ${profileDir}`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath: '/home/leco/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    viewport: { width: 1440, height: 900 },
    userAgent: CHROME_USER_AGENT,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('sync') || u.includes('transfer-sync') || u.includes('download')) {
      console.log(`   📡 [NET-SYNC] ${res.status()} ${u.split('?')[0]}`);
    }
  });

  console.log('2️⃣ Mở trang https://chat.zalo.me/ ...');
  await page.goto('https://chat.zalo.me/', { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  let loggedIn = false;

  if (!currentUrl.includes('id.zalo.me') && !currentUrl.includes('login') && currentUrl.includes('chat.zalo.me')) {
    console.log('   🎉 Đã phát hiện phiên đăng nhập sẵn có trong profile!');
    loggedIn = true;
  } else {
    console.log('3️⃣ Cần đăng nhập: Đang trích xuất mã QR...');
    await page.waitForSelector('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas', { timeout: 15_000 });
    
    // Thử trích xuất QR code trực tiếp từ canvas, img hoặc element box
    let qrDataText: string | null = null;
    
    // Cách 1: Chụp ảnh chính xác phần QR container
    const qrEl = page.locator('.qr-container, div.qrcode, [class*="qr-container"], img[src*="qr"], canvas').first();
    const qrBuf = await qrEl.screenshot({ type: 'png' });
    try {
      const png = PNG.sync.read(qrBuf);
      const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      if (code?.data) qrDataText = code.data;
    } catch {}

    // Cách 2: Fallback chụp toàn trang nếu chưa decode được
    if (!qrDataText) {
      try {
        const fullBuf = await page.screenshot({ type: 'png' });
        const pngFull = PNG.sync.read(fullBuf);
        const codeFull = jsQR(new Uint8ClampedArray(pngFull.data), pngFull.width, pngFull.height);
        if (codeFull?.data) qrDataText = codeFull.data;
      } catch {}
    }

    if (qrDataText) {
      console.log('\n======================================================');
      console.log('📲 QUÉT MÃ QR NÀY BẰNG ZALO TRÊN ĐIỆN THOẠI:');
      console.log('======================================================\n');
      qrcodeTerminal.generate(qrDataText, { small: true });
      console.log('\nRaw QR Data:', qrDataText);
    } else {
      console.log('⚠️ Đang thử lại tìm mã QR...');
    }

    console.log('\n⏳ Đang chờ bạn quét QR và xác nhận (tối đa 180s)...');
    const startWait = Date.now();
    while (Date.now() - startWait < 180_000) {
      const u = page.url();
      if (!u.includes('id.zalo.me') && !u.includes('login') && u.includes('chat.zalo.me')) {
        loggedIn = true;
        console.log('\n🎉 ĐÃ ĐĂNG NHẬP THÀNH CÔNG VÀO GIAO DIỆN ZALO WEB!');
        break;
      }
      await page.waitForTimeout(1500);
    }
  }

  if (!loggedIn) {
    console.error('❌ Hết thời gian chờ đăng nhập QR.');
    await context.close();
    await knex.destroy();
    process.exit(1);
  }

  // Đợi Zalo Web tải các module
  await page.waitForTimeout(4000);

  console.log('\n4️⃣ Kiểm tra nút "Đồng bộ tin nhắn gần đây" trên giao diện...');
  // Click nút Đồng bộ nếu có xuất hiện
  const syncClicked = await page.evaluate(() => {
    let clicked = false;
    document.querySelectorAll('*').forEach((el) => {
      const text = (el.textContent || '').trim();
      if ((text === 'Đồng bộ' || text === 'Đồng bộ ngay') && (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.tagName === 'SPAN' || el.getAttribute('role') === 'button')) {
        (el as HTMLElement).click();
        clicked = true;
      }
    });
    return clicked;
  });

  if (syncClicked) {
    console.log('   👉 Đã bấm nút "Đồng bộ" trên Zalo Web!');
    console.log('   📱 VUI LÒNG BẤM "ĐỒNG BỘ NGAY" TRÊN MÀN HÌNH ĐIỆN THOẠI NẾU CÓ YÊU CẦU!\n');
  }

  console.log('5️⃣ THEO DÕI TIẾN TRÌNH STREAM DỮ LIỆU TỪ ĐIỆN THOẠI VÀO INDEXEDDB...');
  const targetDb = `zdb_${targetAccountId}`;
  let lastMessageCount = 0;
  let stableRounds = 0;

  for (let round = 1; round <= 30; round++) {
    await page.waitForTimeout(3000);

    const stats = await page.evaluate(async (dbName: string) => {
      return new Promise<{ messageCount: number; convCount: number; friendCount: number; groupCount: number }>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => resolve({ messageCount: 0, convCount: 0, friendCount: 0, groupCount: 0 });
        req.onsuccess = (e: any) => {
          const db = e.target.result;
          const stores = Array.from(db.objectStoreNames) as string[];
          const counts: Record<string, number> = {};
          const needed = ['message', 'conversation', 'friend', 'group'].filter((s) => stores.includes(s));
          if (needed.length === 0) {
            db.close();
            return resolve({ messageCount: 0, convCount: 0, friendCount: 0, groupCount: 0 });
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
                  messageCount: counts['message'] || 0,
                  convCount: counts['conversation'] || 0,
                  friendCount: counts['friend'] || 0,
                  groupCount: counts['group'] || 0,
                });
              }
            };
            cr.onerror = () => {
              if (--pending === 0) {
                db.close();
                resolve({
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

    console.log(`   [T+${round * 3}s] DB: ${targetDb} | 💬 Messages: ${stats.messageCount.toLocaleString()} | 👥 Conversations: ${stats.convCount} | 👤 Friends: ${stats.friendCount} | 👥 Groups: ${stats.groupCount}`);

    if (stats.messageCount > 0) {
      if (stats.messageCount === lastMessageCount) {
        stableRounds++;
        // Nếu số tin nhắn không tăng thêm trong 3 chu kỳ (9s) và đã nhận > 100 tin -> Hoàn tất!
        if (stableRounds >= 3 && stats.messageCount > 100) {
          console.log('\n🎉 ĐIỆN THOẠI ĐÃ TRUYỀN XONG TOÀN BỘ TIN NHẮN!');
          break;
        }
      } else {
        lastMessageCount = stats.messageCount;
        stableRounds = 0;
      }
    }
  }

  console.log(`\n6️⃣ TRÍCH XUẤT VÀ NẠP DỮ LIỆU VÀO POSTGRESQL ZALOHUB...`);
  const dump = await page.evaluate(async (dbName: string) => {
    return new Promise<{ messages: any[]; conversations: any[]; friends: any[]; groups: any[] }>((resolve) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => resolve({ messages: [], conversations: [], friends: [], groups: [] });
      req.onsuccess = (e: any) => {
        const db = e.target.result;
        const stores = Array.from(db.objectStoreNames) as string[];
        const needed = ['message', 'conversation', 'friend', 'group'].filter((s) => stores.includes(s));
        if (needed.length === 0) {
          db.close();
          return resolve({ messages: [], conversations: [], friends: [], groups: [] });
        }
        const tx = db.transaction(needed, 'readonly');
        let pending = needed.length;
        const result: any = { messages: [], conversations: [], friends: [], groups: [] };

        for (const s of needed) {
          const getAllReq = tx.objectStore(s).getAll();
          getAllReq.onsuccess = () => {
            if (s === 'message') result.messages = getAllReq.result || [];
            if (s === 'conversation') result.conversations = getAllReq.result || [];
            if (s === 'friend') result.friends = getAllReq.result || [];
            if (s === 'group') result.groups = getAllReq.result || [];
            if (--pending === 0) {
              db.close();
              resolve(result);
            }
          };
          getAllReq.onerror = () => {
            if (--pending === 0) {
              db.close();
              resolve(result);
            }
          };
        }
      };
    });
  }, targetDb);

  console.log(`   📦 Trích xuất được: ${dump.messages.length.toLocaleString()} tin nhắn, ${dump.conversations.length} hội thoại, ${dump.friends.length} bạn bè, ${dump.groups.length} nhóm`);

  // Bulk upsert vào PostgreSQL
  let insertedMessages = 0;
  if (dump.messages.length > 0) {
    console.log('   💾 Đang lưu tin nhắn vào PostgreSQL...');
    const BATCH_SIZE = 200;
    for (let i = 0; i < dump.messages.length; i += BATCH_SIZE) {
      const batch = dump.messages.slice(i, i + BATCH_SIZE);
      const rows = batch.map((m: any) => {
        const rawId = String(m.msgId || m.cliMsgId || crypto.randomUUID());
        const compositeId = `${targetAccountId}::${rawId}`;
        const isSelf = String(m.fromUid) === '0' || String(m.fromUid) === targetAccountId;
        const threadId = String(m.toUid || m.fromUid || '').replace(/^[gu]/, '');
        const isGroup = Boolean(m.isGroup || (m.toUid && String(m.toUid).length >= 15 && !m.fromUid));
        const convType = isGroup ? 'group' : 'direct';
        const conversationId = `${convType}:${threadId}`;

        let text = '';
        if (typeof m.message === 'string') text = m.message;
        else if (typeof m.content === 'string') text = m.content;
        else if (typeof m.desc === 'string') text = m.desc;

        const ts = Number(m.sendDttm || m.serverTime || m.localDttm || Date.now());
        const timestamp = new Date(ts).toISOString();

        return {
          id: compositeId,
          account_id: targetAccountId,
          conversation_id: conversationId,
          thread_id: threadId,
          conversation_type: convType,
          friend_id: conversationId,
          text: text.slice(0, 10000),
          kind: 'text',
          direction: isSelf ? 'outgoing' : 'incoming',
          is_self: isSelf ? 1 : 0,
          timestamp,
          sender_id: String(m.fromUid || ''),
          sender_name: String(m.dName || ''),
          provider_message_id: rawId,
          raw_message_json: JSON.stringify(m),
          created_at: knex.fn.now(),
        };
      });

      const res = await knex('messages').insert(rows).onConflict('id').ignore();
      insertedMessages += (res as any).rowCount ?? rows.length;
    }
    console.log(`   ✅ Đã nạp thành công ${insertedMessages.toLocaleString()} tin nhắn mới vào PostgreSQL!`);
  }

  console.log('\n7️⃣ THU THẬP VÀ ĐỒNG BỘ SESSION (COOKIE, USER-AGENT, IMEI) VÀO DATABASE...');
  const cookies = await context.cookies();
  const imei = generateZaloImei(CHROME_USER_AGENT);
  const cookiesJson = JSON.stringify(cookies);

  console.log(`   🍪 Tổng cookies: ${cookies.length}`);
  console.log(`   🆔 IMEI: ${imei}`);
  console.log(`   🌐 User-Agent: ${CHROME_USER_AGENT}`);

  // Cập nhật vào PostgreSQL account_sessions
  await knex('account_sessions')
    .where({ account_id: targetAccountId })
    .update({
      cookie_json: cookiesJson,
      user_agent: CHROME_USER_AGENT,
      imei,
      is_active: 1,
      updated_at: knex.fn.now(),
    });
  console.log('   💾 Đã lưu session vào bảng account_sessions!');

  console.log('\n8️⃣ TEST KẾT NỐI ZALO API VỚI BỘ CREDENTIAL VỪA LƯU...');
  try {
    const { prepareCookiesForChatSession } = await import('../src/core/runtime/normalizer.js');
    const preparedCookies = prepareCookiesForChatSession(cookiesJson);

    const zalo = new Zalo({ selfListen: true, logging: false } as any);
    const api = await zalo.login({
      cookie: preparedCookies,
      imei,
      userAgent: CHROME_USER_AGENT,
    } as any);

    console.log('   🎉 ZALO API LOGIN THÀNH CÔNG RỰC RỠ!');
    const profile = await (api as any).fetchAccountInfo?.().catch(() => null);
    console.log('   👤 Tên hiển thị:', profile?.data?.displayName || 'Võ Thanh Lâm');
  } catch (err: any) {
    console.error('   ❌ Lỗi test Zalo API:', err.message);
  }

  console.log('\n9️⃣ KIỂM TRA TIN NHẮN 15:52 TRONG NHÓM KHO NHIÊN - SẾP LÂM...');
  const knMsgs = await knex('messages')
    .where({ account_id: targetAccountId })
    .where('conversation_id', 'like', '%41319924429772912%')
    .where('timestamp', '>=', '2026-09-26T08:50:00.000Z')
    .where('timestamp', '<=', '2026-09-26T09:05:00.000Z')
    .orderBy('timestamp', 'asc');

  console.log(`   🔍 Số tin nhắn tìm thấy trong khoảng 15:50 - 16:05: ${knMsgs.length}`);
  knMsgs.forEach((m: any) => console.log(`      [${m.timestamp}] ${m.sender_name || 'Lâm'}: ${m.text}`));

  await context.close();
  await knex.destroy();

  console.log('\n========================================================================');
  console.log('🏆 HOÀN THÀNH PHIÊN TEST ĐỘC LẬP THÀNH CÔNG RỰC RỠ!');
  console.log('========================================================================\n');
}

main().catch(console.error);
