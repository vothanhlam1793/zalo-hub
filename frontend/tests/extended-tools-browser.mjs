import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '../../backend/node_modules/playwright/index.mjs';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let posts = 0, receipt, rejectBeforeReserve = false, missingId;
    let capabilities = { sticker: true, poll: true, forward: true, undo: true, reminder: true, contact: true, audioFile: true };
    await page.route('**/composer/tools/**', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.searchParams.get('conversationId'), 'group:1');
      assert.equal(route.request().headers().authorization, 'Bearer test');
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: capabilities });
      if (url.pathname.endsWith('/stickers')) return route.fulfill({ json: { stickers: [{ id: 1, text: 'One' }] } });
      if (url.pathname.endsWith('/recover')) { receipt = { id: missingId || receipt.id, action: 'recovery', status: 'rejected', result: { dispatched: false } }; return route.fulfill({ json: receipt }); }
      if (route.request().method() === 'POST') { posts++; const body = route.request().postDataJSON(); if (rejectBeforeReserve) { missingId = body.id; return route.fulfill({ status: 429, json: { code: 'TOOL_CAPACITY', reserved: false, dispatched: false } }); } receipt = { id: body.id, action: body.action, status: 'unknown', retryable: false }; return route.fulfill({ json: receipt }); }
      if (url.pathname.endsWith('/actions')) return route.fulfill({ json: { actions: receipt ? [receipt] : [] } });
      if (missingId && url.pathname.endsWith(missingId)) return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
      return route.fulfill({ json: receipt });
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/extended-tools-browser.html`);
    await page.getByRole('button', { name: 'Công cụ khác', exact: true }).click();
    const assertCategory = async (category, field) => {
      await page.locator(`.composer-tool-category[data-category="${category}"] section`).waitFor();
      assert.equal(await page.locator('.composer-tool-category section').count(), 1, 'only selected category is mounted');
      const fields = ['Tìm sticker', 'Câu hỏi', 'Chọn tin nhắn', 'Tiêu đề nhắc hẹn', 'Zalo user ID'];
      for (const label of fields.filter(label => label !== field)) {
        assert.equal(await page.locator(`[aria-label="${label}"]`).count(), 0, `${label} is absent and cannot receive tab focus`);
      }
      // Walk an entire focus cycle, including the category navigation and result panel.
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.closest('.composer-tool-category')?.getAttribute('data-category'));
        assert.ok(!focused || focused === category, 'Tab never enters an unrelated form');
      }
    };
    for (const [label, category, field] of [['Sticker', 'sticker', 'Tìm sticker'], ['Bình chọn', 'poll', 'Câu hỏi'], ['Tin nhắn', 'messages', 'Chọn tin nhắn'], ['Nhắc hẹn', 'reminder', 'Tiêu đề nhắc hẹn'], ['Danh thiếp', 'contact', 'Zalo user ID'], ['Âm thanh', 'audio', '']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await assertCategory(category, field);
    }
    await page.getByRole('button', { name: 'Sticker', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Tìm', exact: true }).isDisabled(), true);
    await page.getByRole('textbox', { name: 'Tìm sticker', exact: true }).fill('hello');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await page.getByRole('button', { name: 'Sticker 1', exact: true }).click();
    await page.getByText(/Kết quả gần đây/).click();
    await page.getByText(/Chưa rõ kết quả/).waitFor();
    assert.equal(posts, 1);
    await page.getByRole('button', { name: 'Bình chọn', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Tạo bình chọn' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Kiểm tra', exact: true }).isVisible(), true, 'result actions remain available across categories');
    await page.reload(); await page.getByRole('button', { name: 'Công cụ khác', exact: true }).click();
    await page.getByText(/Kết quả gần đây/).click();
    await page.getByText(/Chưa rõ kết quả/).waitFor();
    await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
    assert.equal(posts, 1, 'reload and receipt checks never resend');
    // Mock terminal no-dispatch recovery; then exercise an actual pre-reservation 429 + GET404.
    await page.getByRole('button', { name: 'Khôi phục kết quả (không gửi lại)', exact: true }).click();
    await page.getByText(/Không gửi — có thể tạo lượt mới/).waitFor();
    rejectBeforeReserve = true;
    await page.getByRole('textbox', { name: 'Tìm sticker', exact: true }).fill('hello');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await page.getByRole('button', { name: 'Sticker 1', exact: true }).click();
    await page.getByText(/Chưa rõ kết quả/).waitFor();
    await page.getByRole('button', { name: 'Kiểm tra', exact: true }).first().click();
    await page.getByRole('button', { name: 'Bình chọn', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Tạo bình chọn' }).isDisabled(), true, '404 cannot unlock a delayed POST');
    await page.getByRole('button', { name: 'Khôi phục kết quả (không gửi lại)', exact: true }).first().click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Tạo bình chọn')?.disabled);
    assert.equal(posts, 2, 'recovery never sends another provider action');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Công cụ khác');
    assert.equal(await page.getByRole('button', { name: 'Công cụ khác', exact: true }).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Ghi âm thành tệp', exact: true }).click();
    await assertCategory('audio', '');
    assert.equal(await page.getByRole('button', { name: 'Ghi âm thành tệp (tối đa 2 phút)', exact: true }).isVisible(), true);
    await page.keyboard.press('Escape');
    capabilities = { poll: true };
    await page.reload();
    await page.getByRole('button', { name: 'Công cụ khác', exact: true }).click();
    await assertCategory('poll', 'Câu hỏi');
    assert.equal(await page.getByRole('button', { name: 'Sticker', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ghi âm thành tệp', exact: true }).click();
    await page.getByText('Công cụ này chưa khả dụng trong hội thoại hoặc trình duyệt hiện tại.', { exact: true }).waitFor();
    assert.equal(await page.locator('.composer-tool-category section').count(), 0, 'unavailable mic does not open poll');
    await page.keyboard.press('Escape');
    capabilities = {};
    await page.reload();
    await page.getByRole('button', { name: 'Công cụ khác', exact: true }).click();
    await page.getByText('Công cụ này chưa khả dụng trong hội thoại hoặc trình duyệt hiện tại.', { exact: true }).waitFor();
    assert.equal(await page.locator('.composer-tool-category section').count(), 0);
    await page.getByText(/Kết quả gần đây/).click();
    assert.equal(await page.getByRole('button', { name: 'Kiểm tra', exact: true }).first().isVisible(), true, 'recovery available even without tool capabilities');
    console.log(`PASS extended tools ${width}px: capabilities, sticker action, unknown blocks sends, reload/query GET-only`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
