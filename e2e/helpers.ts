import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The two seed sellers from README.md. They are demonstration accounts whose
 * password is published on purpose, not secrets — and they are the only
 * accounts these tests may use, because their rows are all `is_seed = true`.
 */
export const SELLER_A = {
  email: process.env.E2E_SELLER_A_EMAIL ?? 'seed.ploy@example.invalid',
  password: process.env.E2E_SELLER_A_PASSWORD ?? 'seed-password-not-a-secret',
};
export const SELLER_B = {
  email: process.env.E2E_SELLER_B_EMAIL ?? 'seed.nut@example.invalid',
  password: process.env.E2E_SELLER_B_PASSWORD ?? 'seed-password-not-a-secret',
};

type Account = typeof SELLER_A;

/** Signs in through the real form, the way a seller does. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('อีเมล').fill(account.email);
  await page.getByLabel('รหัสผ่าน').fill(account.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** A name no seed product has, so a test only ever sees its own row. */
export function uniqueName(label: string): string {
  return `E2E ${label} ${Date.now()}`;
}

type ProductSummary = { id: string; name: string; status: string };

/** The signed-in seller's own catalogue, read straight from the API. */
export async function myProducts(request: APIRequestContext): Promise<ProductSummary[]> {
  const res = await request.get('/api/v1/products/mine');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { products: ProductSummary[] };
  return body.products;
}

/**
 * Removes every product a test created, by name prefix. Runs through the API,
 * not the UI, so a failing test still cleans up. Deleting emits a seed-flagged
 * `product.deleted` event, which is correct: it is a seller action that happened.
 */
export async function deleteTestProducts(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/v1/products/mine');
  if (res.status() !== 200) return;
  const { products } = (await res.json()) as { products: ProductSummary[] };
  for (const p of products.filter((x) => x.name.startsWith('E2E '))) {
    await request.delete(`/api/v1/products/${p.id}`);
  }
}
