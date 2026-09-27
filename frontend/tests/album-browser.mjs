import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '../../backend/node_modules/playwright/index.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/media/*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>' }));
    await page.goto(`${server.resolvedUrls.local[0]}tests/album-browser.html`);
    const grid = page.locator('[data-album-grid]');
    await grid.waitFor();
    assert.equal(await page.locator('[data-album-item]').count(), 4);
    const composer = page.locator('form');
    const before = await composer.boundingBox();
    await grid.hover();
    await page.locator('[data-action-message="photo-3"] button').first().click();
    assert.deepEqual(await composer.boundingBox(), before);
    await page.locator('[data-action-message="photo-3"]').getByRole('button', { name: 'Thả cảm xúc ❤️', exact: true }).click();
    assert.equal(await page.locator('#reaction').textContent(), 'photo-3');
    await page.getByRole('button', { name: 'Xem ảnh 2', exact: true }).click();
    await page.locator('[role="dialog"] img[src="/media/3.svg"]').waitFor();
    await page.getByRole('button', { name: 'Ảnh tiếp theo' }).click();
    await page.locator('[role="dialog"] img[src="/media/2.svg"]').waitFor();
    // A background realtime update reorders album entries but must not change the viewed photo.
    await page.locator('#realtime').evaluate(button => button.click());
    await page.locator('[role="dialog"] img[src="/media/2.svg"]').waitFor();
    await page.getByRole('button', { name: 'Đóng ảnh' }).click();
    const viewport = page.locator('[style*="overflow-anchor"]');
    await viewport.hover();
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(200);
    const anchorBefore = await page.locator('[data-message-id="photo-4"]').evaluate(el => el.getBoundingClientRect().top);
    await page.locator('#older').click();
    await page.waitForTimeout(100);
    const anchorAfter = await page.locator('[data-album-anchor="photo-4"]').evaluate(el => el.getBoundingClientRect().top);
    assert.ok(Math.abs(anchorAfter - anchorBefore) < 2, `anchor moved ${anchorAfter - anchorBefore}px`);
    assert.equal(await page.locator('[data-album-item]').count(), 4);
    await page.locator('summary').click();
    await page.locator('[data-action-message="photo-0"] button').first().click();
    await page.locator('[data-action-message="photo-0"]').getByRole('button', { name: '↩ Trả lời' }).click();
    await page.getByText('Đang trả lời An').waitFor();
    assert.ok(await page.getByText('Caption 0', { exact: true }).count() >= 2);
    console.log(`PASS album browser ${width}px: bounded grid, floating controls/composer, original reply/reaction, lightbox/realtime identity, older-member anchor`);
    await page.close();
    for (const scenario of ['short', 'inner', 'same-url']) {
      const regression = await browser.newPage({ viewport: { width, height: 900 } });
      await regression.route('**/media/*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>' }));
      await regression.goto(`${server.resolvedUrls.local[0]}tests/album-browser.html?scenario=${scenario}`);
      await regression.locator('[data-album-grid="2"]').waitFor();
      if (scenario === 'short') {
        const viewport = regression.locator('[style*="overflow-anchor"]');
        assert.equal(await viewport.evaluate(el => el.scrollHeight <= el.clientHeight), true);
        const load = regression.getByRole('button', { name: 'Tải thêm tin cũ', exact: true });
        await load.evaluate(button => { button.click(); button.click(); });
        assert.equal(await regression.locator('#loads').textContent(), '1');
        assert.equal(await regression.getByRole('button', { name: 'Đang tải thêm tin cũ...' }).isDisabled(), true);
        await load.waitFor();
        await load.click();
        assert.equal(await regression.locator('#loads').textContent(), '2');
      } else if (scenario === 'inner') {
        const viewport = regression.locator('[style*="overflow-anchor"]');
        const caption = regression.locator('[data-content-anchor="caption:photo-1"]');
        await viewport.dispatchEvent('wheel');
        await caption.evaluate(el => {
          const viewport = el.closest('[style*="overflow-anchor"]');
          viewport.scrollTop += el.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 8;
          viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        await regression.waitForTimeout(100);
        const before = await caption.evaluate(el => el.getBoundingClientRect().top);
        await regression.locator('#older').evaluate(button => button.click());
        await regression.locator('[data-album-grid="3"]').waitFor();
        const after = await caption.evaluate(el => el.getBoundingClientRect().top);
        assert.ok(Math.abs(after - before) < 2, `2->3 caption anchor drift ${after - before}`);
      } else {
        await regression.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
        const image = regression.locator('[role="dialog"] img');
        await image.waitFor();
        await regression.waitForFunction(() => document.querySelector('[role="dialog"] img')?.classList.contains('opacity-100'));
        await image.evaluate(el => { el.dataset.originalNode = 'yes'; });
        await regression.getByRole('button', { name: 'Ảnh tiếp theo' }).click();
        await regression.waitForFunction(() => document.querySelector('[role="dialog"] img')?.classList.contains('opacity-100'));
        assert.equal(await image.getAttribute('src'), '/media/1.svg');
        assert.equal(await image.getAttribute('data-original-node'), null);
        assert.equal(await regression.locator('[role="dialog"] .animate-spin').count(), 0);
      }
      console.log(`PASS reviewer regression ${scenario} ${width}px`);
      await regression.close();
    }
  }
} finally { await browser.close(); await server.close(); }
