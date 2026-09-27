import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '../../backend/node_modules/playwright/index.mjs';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let active = 0, peak = 0, posts = [], result;
    const stages = new Map();
    await page.route('**/composer/**', async route => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(new URL(route.request().url()).searchParams.get('conversationId'), 'direct:contact');
      const respond = body => route.fulfill({ json: body });
      if (path.endsWith('/capabilities')) return respond({ version: 1, staging: true, batch: true, nativeAlbum: false, maxFileBytes: 52428800, maxBatchItems: 10, uploadConcurrency: 2 });
      if (path.endsWith('/staging')) {
        active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 100)); active--;
        const staging = { id: crypto.randomUUID(), status: 'ready', expiresAt: new Date(Date.now() + 86400000).toISOString() }; stages.set(staging.id, staging); return respond({ staging });
      }
      if (path.includes('/staging/')) return respond({ staging: stages.get(path.split('/').pop()) });
      if (path.endsWith('/batches')) {
        const payload = route.request().postDataJSON(); posts.push(payload);
        result = { ...payload, status: payload.retry ? 'sent' : 'partial', items: payload.items.map((item, i) => ({ ...item, status: payload.retry || i !== 1 ? 'sent' : 'failed', retryable: i === 1, providerMessageIds: [] })) };
        return respond({ batch: result });
      }
      return respond({ batch: result });
    });
    await page.goto(`${server.resolvedUrls.local[0]}tests/composer-browser.html`);
    await page.waitForFunction(() => window.composerTest);
    const migration = await page.evaluate(async () => {
      const t = window.composerTest;
      const migrated = t.migrateComposer({ text: 'old', fileName: 'lost.png' });
      const record = { version: 2, text: 'restored', mentions: [{ uid: 'u', pos: 0, len: 2 }], replyingTo: { id: 'reply' }, attachments: [{ id: 'blob', file: new Blob(['bytes']), name: 'x', upload: 'local' }] };
      await t.clientDb.saveComposer(t.key, record); const restored = await t.clientDb.getDraft(t.key);
      const other = await t.clientDb.getDraft(JSON.stringify(['other', 'account', 'direct:contact']));
      await t.clientDb.saveComposer(t.key, { version: 2, text: '', attachments: [] });
      return { missing: migrated.attachments[0].upload, blob: await restored.attachments[0].file.text(), reply: restored.replyingTo.id, mentions: restored.mentions.length, other };
    });
    assert.deepEqual(migration, { missing: 'missing', blob: 'bytes', reply: 'reply', mentions: 1, other: null });
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).fill('AB');
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).evaluate(input => input.setSelectionRange(1, 1));
    const before = await page.locator('form').boundingBox();
    await page.getByRole('button', { name: 'Biểu tượng cảm xúc', exact: true }).click();
    assert.deepEqual(await page.locator('form').boundingBox(), before, 'popover does not shift composer');
    await page.getByRole('button', { name: 'Chèn 👍', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).inputValue(), 'A👍B');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Biểu tượng cảm xúc');
    assert.equal(await page.getByRole('button', { name: 'Biểu tượng cảm xúc', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Mẫu trả lời', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu nội dung hiện tại làm mẫu (tối đa 30)' }).click();
    await page.getByRole('button', { name: 'A👍B', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
    assert.equal(await page.getByRole('group', { name: 'Công cụ soạn tin' }).getByRole('button').count(), 7);
    await page.locator('form').evaluate(form => { const transfer = new DataTransfer(); transfer.items.add(new File(['drop'], 'drop.txt', { type: 'text/plain' })); form.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })); });
    await page.getByRole('button', { name: 'Bỏ drop.txt', exact: true }).click();
    await page.locator('form').evaluate(form => { const transfer = new DataTransfer(); transfer.items.add(new File(['image'], 'paste.png', { type: 'image/png' })); form.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })); });
    await page.getByRole('button', { name: 'Bỏ paste.png', exact: true }).click();
    const fallback = await page.evaluate(async () => {
      const t = window.composerTest, original = t.clientDb.saveComposer;
      t.clientDb.saveComposer = async () => false;
      t.store.getState().updateDraft(t.key, { text: 'quota' });
      await new Promise(resolve => setTimeout(resolve, 30));
      const warning = Boolean(t.store.getState().storageWarning);
      t.clientDb.saveComposer = original;
      return warning;
    });
    assert.equal(fallback, true);
    await page.locator('input[type=file]').setInputFiles([1, 2, 3].map(i => ({ name: `file-${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`file ${i}`) })));
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).fill('common');
    await page.getByRole('button', { name: '3. file-3.txt', exact: true }).click();
    await page.getByRole('button', { name: 'Đưa tệp 3 lên' }).click();
    await page.getByRole('textbox', { name: 'Chú thích 2', exact: true }).fill('item');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '1. file-1.txt', exact: true }).click();
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chuẩn bị tệp', exact: true }).click();
    await page.waitForFunction(() => window.composerTest.store.getState().attachments.every(a => a.upload === 'ready'));
    assert.equal(peak, 2);
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await page.getByText(/Hộp gửi · .*Chi tiết/).click();
    await page.getByRole('button', { name: 'Thử lại các tệp lỗi cho phép' }).waitFor();
    assert.equal(posts.length, 1); assert.deepEqual(posts[0].items.map(i => i.caption), ['common', 'item', '']);
    // Detach is fail-closed when IndexedDB cannot commit the immutable old batch.
    await page.evaluate(() => { const t = window.composerTest; t.originalSave = t.clientDb.saveComposer; t.clientDb.saveComposer = async () => false; });
    await page.getByRole('button', { name: 'Lưu vào hộp gửi / Soạn đợt mới' }).click();
    await page.getByText('Không lưu được hộp gửi.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).isDisabled(), true);
    await page.evaluate(() => { const t = window.composerTest; t.clientDb.saveComposer = t.originalSave; });
    await page.getByRole('button', { name: 'Lưu vào hộp gửi / Soạn đợt mới' }).click();
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).fill('new independent draft');
    await page.reload();
    await page.getByText(/Hộp gửi · .*Chi tiết/).click();
    await page.getByRole('button', { name: 'Thử lại các tệp lỗi cho phép' }).waitFor();
    await page.waitForTimeout(2300); assert.equal(posts.length, 1, 'reload never POSTs');
    assert.equal(await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).inputValue(), 'new independent draft');
    await page.getByRole('button', { name: 'Thử lại các tệp lỗi cho phép' }).click();
    await page.getByText('Đã gửi tất cả', { exact: true }).waitFor();
    assert.equal(posts.length, 2); assert.equal(posts[1].retry, true); assert.equal(posts[0].clientBatchId, posts[1].clientBatchId); assert.deepEqual(posts[0].items, posts[1].items);
    assert.equal(await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).inputValue(), 'new independent draft', 'old retry cannot overwrite new draft');
    await page.evaluate(async () => {
      const t = window.composerTest, old = t.store.getState().outbox[0];
      t.store.getState().updateDraft(t.key, { outbox: [{ ...old, batch: { ...old.batch, result: { ...old.batch.result, status: 'unknown', items: old.batch.result.items.map(i => ({ ...i, status: 'unknown', retryable: false })) } } }] });
      await t.sendComposerBatch(t.key);
    });
    assert.equal(posts.length, 2, 'unknown archived batch blocks competing new dispatch');
    await page.reload();
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn' }).fill('still editable with unknown outbox');
    await page.getByRole('region', { name: 'Hộp gửi đã lưu', exact: true }).waitFor();
    assert.equal(posts.length, 2, 'unknown reload remains GET-only');
    console.log(`PASS composer ${width}px: IDB blobs/migration/ownership/reply/mentions, reorder, modal, concurrency=2, immutable captions, reload GET-only, partial explicit retry`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
