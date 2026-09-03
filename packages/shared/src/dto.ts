/**
 * Types shared between apps/web and apps/api.
 *
 * architecture.md: packages/shared "must not hold a second copy of a type
 * defined elsewhere". If web needs a shape the API returns, it is defined here
 * and imported by both, never re-typed on the client.
 */

// ---------------------------------------------------------------------------
// Enumerations that exist in the database
// ---------------------------------------------------------------------------

export const USER_ROLES = ['seller', 'buyer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STORE_STATUSES = ['active', 'paused'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'published', 'unpublished'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Store category. Also the peer group for any comparison framing in a later
 * experiment (database-schema.md), which is why it is a fixed list and not a
 * free-text field: "อาหาร" and "ขายอาหาร" would be two peer groups.
 */
export const STORE_CATEGORIES = [
  'food',
  'drinks',
  'dessert',
  'fashion',
  'handmade',
  'beauty',
  'stationery',
  'service',
  'other',
] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const STORE_CATEGORY_LABELS_TH: Record<StoreCategory, string> = {
  food: 'อาหาร',
  drinks: 'เครื่องดื่ม',
  dessert: 'ของหวาน',
  fashion: 'เสื้อผ้าและแฟชั่น',
  handmade: 'งานแฮนด์เมด',
  beauty: 'ความงาม',
  stationery: 'เครื่องเขียน',
  service: 'บริการ',
  other: 'อื่น ๆ',
};

/**
 * Q-5 in product-backlog.md is unresolved and PB-16 is blocked on it.
 * Recorded here as the placeholder from database-schema.md so that nothing
 * else invents a competing list in the meantime. No order code is built yet.
 */
export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'ready',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** api-spec.md: one error shape, always. `code` is what the client branches on. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}

export interface UserDto {
  id: string;
  role: UserRole;
  displayName: string;
}

export interface StoreDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: StoreCategory;
  contactChannel: string | null;
  status: StoreStatus;
}

export interface ProductPhotoDto {
  id: string;
  /**
   * Built at read time from the stored key, never persisted. The row holds an
   * object-storage key so the bucket can move without rewriting history
   * (database-schema.md); this URL may be a signed one that expires.
   */
  url: string;
  position: number;
}

export interface ProductDto {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  priceSatang: number;
  stock: number;
  status: ProductStatus;
  photoCount: number;
  photos: ProductPhotoDto[];
  createdAt: string;
  updatedAt: string;
}

export interface MeResponse {
  user: UserDto;
  store: StoreDto | null;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Money is integer satang everywhere. `฿12.30` is `1230`.
 * database-schema.md: "Floating point money produces totals that do not add up,
 * which sellers notice immediately."
 *
 * The API never formats and the UI never does arithmetic, so both of these live
 * here rather than one in each app.
 */
export function formatSatang(satang: number): string {
  const baht = Math.trunc(satang / 100);
  const remainder = Math.abs(satang % 100);
  return `${baht.toLocaleString('th-TH')}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Parse a baht string from a form into satang. Returns null if not valid money.
 *
 * Thousands separators are accepted only in correct positions. Stripping every
 * comma before validating would quietly accept "12," and "1,2,3" as numbers,
 * and a price the seller did not type is worse than a rejected form.
 *
 * More than two decimal places is refused rather than rounded: silently turning
 * 12.345 into 12.35 makes the stored price differ from the typed one with
 * nobody told.
 */
export function parseBahtToSatang(input: string): number | null {
  const trimmed = input.trim();

  const grouped = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$/;
  const plain = /^\d+(\.\d{1,2})?$/;
  if (!grouped.test(trimmed) && !plain.test(trimmed)) return null;

  const normalised = trimmed.replace(/,/g, '');
  const [wholePart, fracPart = ''] = normalised.split('.');
  const whole = Number(wholePart);
  const frac = Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(whole)) return null;
  return whole * 100 + frac;
}
