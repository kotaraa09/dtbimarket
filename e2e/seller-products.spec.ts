/**
 * The five tests the Module 2 week 9 homework requires, against the live site.
 *
 *   1  main path       — a seller adds a product and sees it in their catalogue
 *   2  status change   — publish, then hide, and the status follows
 *   3  required field  — a product with no name is not saved
 *   4  🔒 signed out   — no catalogue data without a session
 *   5  🔒 second store — seller B cannot read or change seller A's product
 *
 * 4 and 5 are the security tests. If either fails, data is leaking for real.
 * Do not change the application to make a test pass without first deciding
 * whether the code or the test is wrong.
 */
import { expect, test } from '@playwright/test';
import {
  SELLER_A,
  SELLER_B,
  deleteTestProducts,
  myProducts,
  signIn,
  uniqueName,
} from './helpers';

test.afterEach(async ({ page }) => {
  // Only a signed-in context can delete; tests 4 and 5 clean up themselves.
  await deleteTestProducts(page.request);
});

test('1 · เส้นทางหลัก: ผู้ขายเพิ่มสินค้าใหม่ แล้วเห็นในรายการสินค้าของร้าน', async ({ page }) => {
  await signIn(page, SELLER_A);
  await page.getByRole('link', { name: 'สินค้า', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/products$/);

  const name = uniqueName('main');
  await page.getByRole('button', { name: '+ เพิ่มสินค้า' }).click();
  await page.getByLabel('ชื่อสินค้า').fill(name);
  await page.getByLabel('คำอธิบาย', { exact: true }).fill('สินค้าทดสอบอัตโนมัติ');
  await page.getByLabel('ราคา (บาท)').fill('45.00');
  await page.getByLabel('จำนวนคงเหลือ').fill('3');
  await page.getByRole('button', { name: 'สร้างสินค้า' }).click();

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.locator('.tag')).toHaveText('ฉบับร่าง');
  await expect(row).toContainText('45.00');

  // Saved on the server, not just drawn on the page.
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();
});

test('2 · เปลี่ยนสถานะ: กดเผยแพร่แล้วเป็น "เผยแพร่" กดซ่อนแล้วเป็น "ซ่อนอยู่"', async ({ page }) => {
  await signIn(page, SELLER_A);
  const name = uniqueName('status');
  const created = await page.request.post('/api/v1/products', {
    data: { name, priceSatang: 5000, stock: 1 },
  });
  expect(created.status()).toBe(201);

  await page.goto('/dashboard/products');
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row.locator('.tag')).toHaveText('ฉบับร่าง');

  await row.getByRole('button', { name: 'เผยแพร่' }).click();
  await expect(row.locator('.tag')).toHaveText('เผยแพร่');
  expect((await myProducts(page.request)).find((p) => p.name === name)?.status).toBe(
    'published',
  );

  await row.getByRole('button', { name: 'ซ่อน' }).click();
  await expect(row.locator('.tag')).toHaveText('ซ่อนอยู่');
  expect((await myProducts(page.request)).find((p) => p.name === name)?.status).toBe(
    'unpublished',
  );
});

test('3 · ช่องบังคับกรอก: ไม่ใส่ชื่อสินค้าแล้วต้องไม่บันทึก', async ({ page }) => {
  await signIn(page, SELLER_A);
  await page.goto('/dashboard/products');
  const before = (await myProducts(page.request)).length;

  await page.getByRole('button', { name: '+ เพิ่มสินค้า' }).click();
  // Price is valid, so the only thing wrong is the missing name.
  await page.getByLabel('ราคา (บาท)').fill('45.00');

  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/products') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'สร้างสินค้า' }).click();

  // The server refuses it — the form's `required` is not what protects the data.
  expect((await response).status()).toBe(422);
  await expect(page.locator('.error')).toBeVisible();
  // The form stays open so the seller can fix it.
  await expect(page.getByRole('heading', { name: 'เพิ่มสินค้าใหม่' })).toBeVisible();

  expect((await myProducts(page.request)).length).toBe(before);
});

test('4 · 🔒 ไม่ล็อกอิน: เปิดหน้าสินค้าและเรียกข้อมูลสินค้าไม่ได้', async ({ page }) => {
  // A fresh context: no session cookie at all.
  await page.goto('/dashboard/products');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('table')).toHaveCount(0);

  // The redirect is only the browser being polite. The API is what must refuse.
  const catalogue = await page.request.get('/api/v1/products/mine');
  expect(catalogue.status()).toBe(401);
  expect(await catalogue.text()).not.toContain('priceSatang');

  const create = await page.request.post('/api/v1/products', {
    data: { name: uniqueName('anon'), priceSatang: 100, stock: 1 },
  });
  expect(create.status()).toBe(401);
});

test('5 · 🔒 บัญชีที่สอง: ผู้ขาย B เปิดหรือแก้สินค้าของผู้ขาย A ไม่ได้', async ({ browser }) => {
  // Two separate browser contexts, so the two sessions cannot share a cookie.
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();

  try {
    await signIn(a, SELLER_A);
    const name = uniqueName('private');
    const created = await a.request.post('/api/v1/products', {
      data: { name, priceSatang: 9900, stock: 2 },
    });
    expect(created.status()).toBe(201);
    const { product } = (await created.json()) as { product: { id: string } };

    await signIn(b, SELLER_B);

    // B's catalogue page and B's API view do not contain A's product.
    await b.goto('/dashboard/products');
    await expect(b.getByRole('heading', { name: 'สินค้า', exact: true })).toBeVisible();
    await expect(b.getByText(name)).toHaveCount(0);
    expect((await myProducts(b.request)).some((p) => p.id === product.id)).toBe(false);

    // B knows A's product ID and tries to change it. 404, not 403: a 403
    // would confirm the ID exists in someone else's store.
    const rename = await b.request.patch(`/api/v1/products/${product.id}`, {
      data: { name: 'ถูกแก้โดยร้านอื่น' },
    });
    expect(rename.status()).toBe(404);
    expect((await b.request.post(`/api/v1/products/${product.id}/publish`)).status()).toBe(404);
    expect((await b.request.delete(`/api/v1/products/${product.id}`)).status()).toBe(404);

    // And from A's side nothing happened to it.
    const after = (await myProducts(a.request)).find((p) => p.id === product.id);
    expect(after).toMatchObject({ name, status: 'draft' });
  } finally {
    await deleteTestProducts(a.request);
    await aContext.close();
    await bContext.close();
  }
});
