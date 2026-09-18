'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AI_DISCLAIMER_TH,
  formatSatang,
  type AiSummaryDto,
  type AiSummaryMetricSnapshot,
  type ProductDto,
} from '@dtbi/shared';
import { api, ApiRequestError } from '../../lib/api';
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

          <AiSummaryCard />

          <div className="card">
            <h2>ยังไม่มีในหน้านี้</h2>
            <p className="muted">
              ยอดเข้าชม คำสั่งซื้อ และรายได้ จะมาจากชั้นคำนวณตัวชี้วัดร่วม
              ซึ่งยังไม่ได้สร้าง (PB-17, PB-18) — จึงยังไม่แสดงตัวเลขเหล่านี้
              แทนที่จะเดา
            </p>
            <p className="faint">
              คำแนะนำจากผู้ช่วยแนะนำ (advisor) ที่สุ่มตามกลุ่มทดลอง
              จะปรากฏที่นี่ใน PB-24 และเป็นคนละอย่างกับสรุปด้านบน
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

/**
 * Level 2 of the week-8 AI assistant (ADR-0007).
 *
 * This is NOT the advisor. The advisor delivers templated copy under a randomised
 * variant and is scored by the 7-day action rate (ADR-0002); this is a button
 * the seller presses, producing text nobody randomised and nothing scores. The
 * two are kept visually and verbally distinct on purpose — a seller who cannot
 * tell them apart is a seller whose experiment exposure cannot be interpreted.
 *
 * The snapshot is rendered underneath the summary rather than hidden behind a
 * toggle. Every number in the text has to appear in that list, so the list is
 * how the seller checks the summary instead of trusting it.
 */
function AiSummaryCard() {
  const [summary, setSummary] = useState<AiSummaryDto | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ enabled: boolean; summary: AiSummaryDto | null }>(
        '/ai/summary',
      );
      setEnabled(r.enabled);
      setSummary(r.summary);
    } catch {
      // A dashboard that fails to load because an optional panel could not
      // fetch is a worse outcome than a panel that quietly offers the button.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ summary: AiSummaryDto }>('/ai/summary');
      setSummary(r.summary);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.thaiMessage : 'เรียก AI ไม่สำเร็จ',
      );
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setBusy(true);
    try {
      await api.post(`/ai/summary/${id}/dismiss`);
      setSummary(null);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.thaiMessage : 'ปิดสรุปไม่สำเร็จ',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="spread">
        <h2>ผู้ช่วย AI สรุปร้าน</h2>
        <button type="button" disabled={busy || !enabled} onClick={() => void generate()}>
          {busy ? 'กำลังอ่านข้อมูลร้าน…' : summary ? 'สรุปใหม่' : 'ให้ AI สรุปร้านของคุณ'}
        </button>
      </div>

      <p className="muted">
        อ่านสินค้า รูปสินค้า และประวัติการแก้ไขร้านของคุณ แล้วสรุปให้อ่าน
        — ไม่เปลี่ยนแปลงอะไรในร้านเอง
      </p>

      {!enabled ? (
        <p className="faint">ยังไม่ได้ตั้งค่าคีย์ AI บนเซิร์ฟเวอร์ — ส่วนอื่นใช้งานได้ตามปกติ</p>
      ) : null}

      {error ? <div className="error">{error}</div> : null}

      {!loaded ? (
        <p className="muted">กำลังโหลด…</p>
      ) : summary ? (
        <div className="ai-panel">
          <span className="ai-label">{AI_DISCLAIMER_TH}</span>
          <p>{summary.summary}</p>
          <p className="ai-action">{summary.suggestedAction}</p>

          <SnapshotFacts snapshot={summary.metricSnapshot} />

          <div className="row" style={{ marginTop: '.6rem' }}>
            <button
              type="button"
              className="secondary small"
              disabled={busy}
              onClick={() => void dismiss(summary.id)}
            >
              ปิดสรุปนี้
            </button>
            <span className="faint">
              {new Date(summary.generatedAt).toLocaleString('th-TH')} ·{' '}
              <span className="mono">{summary.model}</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="faint">ยังไม่มีสรุป — กดปุ่มด้านบนเพื่อให้ AI อ่านข้อมูลร้านแล้วสรุปให้</p>
      )}
    </div>
  );
}

/** The figures the summary was written from, exactly as they were then. */
function SnapshotFacts({ snapshot }: { snapshot: AiSummaryMetricSnapshot }) {
  const rows: [string, string][] = [
    ['สินค้าทั้งหมด', `${snapshot.productCount}`],
    ['เผยแพร่อยู่', `${snapshot.publishedCount}`],
    ['ฉบับร่าง', `${snapshot.draftCount}`],
    ['มีรูปน้อยกว่า 2 รูป', `${snapshot.photosMissingCount}`],
    ['รูปทั้งหมด', `${snapshot.photoCount}`],
    ['ของหมด', `${snapshot.outOfStockCount}`],
    ['แก้ไขร้านใน 7 วัน', `${snapshot.catalogueChangesLast7Days} ครั้ง`],
    ['มูลค่าสต๊อก', `฿${formatSatang(snapshot.stockValueSatang)}`],
  ];

  return (
    <>
      <div className="faint" style={{ marginTop: '.5rem' }}>
        ตัวเลขที่ AI ใช้เขียนสรุปนี้ — ทุกตัวเลขในข้อความต้องมาจากรายการนี้
      </div>
      <ul className="ai-facts">
        {rows.map(([label, value]) => (
          <li key={label}>
            {label}: <span className="num">{value}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
