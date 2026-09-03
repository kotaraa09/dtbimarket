'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatSatang, type ProductDto } from '@dtbi/shared';
import { api } from '../../lib/api';
import { useMe } from '../../lib/use-me';

/**
 * Overview of the seller's own catalogue.
 *
 * These are counts derived from the product list, NOT the dashboard metrics
 * from PB-17. That endpoint (`GET /dashboard/metrics`) does not exist yet, and
 * it is the one that emits `dashboard.viewed` and excludes seed rows through
 * the shared metric layer. Deriving views, orders or revenue here would mean a
 * second implementation of a definition that REQ-D2 says must exist once — so
 * this page shows only what it can count honestly, and says so.
 */
export default function DashboardPage() {
  const { state } = useMe();
  const [products, setProducts] = useState<ProductDto[] | null>(null);

  useEffect(() => {
    if (state.status !== 'signed-in' || !state.me.store) return;
    void api
      .get<{ products: ProductDto[] }>('/products/mine')
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [state]);

  if (state.status !== 'signed-in' || !state.me.store) return null;

  const store = state.me.store;
  const published = products?.filter((p) => p.status === 'published') ?? [];
  const drafts = products?.filter((p) => p.status === 'draft') ?? [];
  const underTwoPhotos = published.filter((p) => p.photoCount < 2);
  const stockValue = published.reduce(
    (sum, p) => sum + p.priceSatang * p.stock,
    0,
  );

  return (
    <>
      <div className="spread">
        <div>
          <h1>{store.name}</h1>
          <p className="muted">
            ร้านของคุณ · <span className="mono">/{store.slug}</span>
          </p>
        </div>
      </div>

      {products === null ? (
        <p className="muted">กำลังโหลด…</p>
      ) : (
        <>
          <div className="grid" style={{ marginBottom: '1rem' }}>
            <div className="stat">
              <div className="value">{published.length}</div>
              <div className="label">สินค้าที่เผยแพร่</div>
            </div>
            <div className="stat">
              <div className="value">{drafts.length}</div>
              <div className="label">ฉบับร่าง</div>
            </div>
            <div className="stat">
              <div className="value">{underTwoPhotos.length}</div>
              <div className="label">มีรูปน้อยกว่า 2 รูป</div>
            </div>
            <div className="stat">
              <div className="value">
                <span className="baht">฿</span>
                {formatSatang(stockValue)}
              </div>
              <div className="label">มูลค่าสต๊อก</div>
            </div>
          </div>

          <div className="card">
            <h2>ยังไม่มีในหน้านี้</h2>
            <p className="muted">
              ยอดเข้าชม คำสั่งซื้อ และรายได้ จะมาจากชั้นคำนวณตัวชี้วัดร่วม
              ซึ่งยังไม่ได้สร้าง (PB-17, PB-18) — จึงยังไม่แสดงตัวเลขเหล่านี้
              แทนที่จะเดา
            </p>
            <p className="faint">
              คำแนะนำจากผู้ช่วย AI จะปรากฏที่นี่ใน PB-24
            </p>
          </div>

          {underTwoPhotos.length > 0 ? (
            <div className="card">
              <h2>สินค้าที่ยังมีรูปน้อย</h2>
              <p className="muted">
                {underTwoPhotos.length} รายการมีรูปน้อยกว่า 2 รูป
              </p>
              <ul className="muted">
                {underTwoPhotos.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {p.name} — {p.photoCount} รูป
                  </li>
                ))}
              </ul>
              <p className="faint">
                เปิดหน้าสินค้าแล้วกด “แก้ไข” เพื่อเพิ่มรูป
              </p>
            </div>
          ) : null}

          <div className="row">
            <Link href="/dashboard/products">
              <button type="button">จัดการสินค้า</button>
            </Link>
          </div>
        </>
      )}
    </>
  );
}
