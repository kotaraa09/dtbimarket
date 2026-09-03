'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRef } from 'react';
import {
  formatSatang,
  parseBahtToSatang,
  type ProductDto,
} from '@dtbi/shared';
import { api, ApiRequestError } from '../../../lib/api';

/**
 * PB-08 product CRUD, PB-09 publish/unpublish, PB-11 price and stock.
 *
 * Price, stock and publishing each call their own endpoint. That looks like
 * more work than one "save" button, and it is the point: each one emits a
 * distinct event, and a single combined save would collapse four different
 * seller behaviours into one that analysis cannot separate again (api-spec.md).
 */

const STATUS_LABEL: Record<ProductDto['status'], string> = {
  draft: 'ฉบับร่าง',
  published: 'เผยแพร่',
  unpublished: 'ซ่อนอยู่',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ products: ProductDto[] }>('/products/mine');
      setProducts(r.products);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.thaiMessage : 'โหลดไม่สำเร็จ');
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every mutation goes through here so one failure path is handled once. */
  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.thaiMessage : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const priceSatang = parseBahtToSatang(String(data.get('price') ?? ''));
    if (priceSatang === null) {
      setError('ราคาไม่ถูกต้อง — ใส่ได้ไม่เกิน 2 ตำแหน่งทศนิยม');
      return;
    }

    await run('new', async () => {
      await api.post('/products', {
        name: String(data.get('name') ?? ''),
        description: String(data.get('description') ?? ''),
        priceSatang,
        stock: Number(data.get('stock') ?? 0),
      });
      form.reset();
      setCreating(false);
    });
  }

  return (
    <>
      <div className="spread">
        <div>
          <h1>สินค้า</h1>
          <p className="muted">สร้าง แก้ไข และเผยแพร่สินค้าของร้านคุณ</p>
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'ยกเลิก' : '+ เพิ่มสินค้า'}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {creating ? (
        <form className="card" onSubmit={onCreate} noValidate>
          <h2>เพิ่มสินค้าใหม่</h2>
          <div className="field">
            <label htmlFor="name">ชื่อสินค้า</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="description">คำอธิบาย</label>
            <textarea id="description" name="description" />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="price">ราคา (บาท)</label>
              <input id="price" name="price" inputMode="decimal" required placeholder="45.00" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="stock">จำนวนคงเหลือ</label>
              <input id="stock" name="stock" type="number" min={0} defaultValue={0} />
            </div>
          </div>
          <p className="faint">สินค้าใหม่จะเป็นฉบับร่าง จนกว่าคุณจะกดเผยแพร่</p>
          <button type="submit" disabled={busy === 'new'}>
            {busy === 'new' ? 'กำลังบันทึก…' : 'สร้างสินค้า'}
          </button>
        </form>
      ) : null}

      <div className="card">
        {products === null ? (
          <p className="muted">กำลังโหลด…</p>
        ) : products.length === 0 ? (
          <div className="empty">
            <p>ยังไม่มีสินค้า</p>
            <p className="faint">กด “เพิ่มสินค้า” เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>สถานะ</th>
                <th className="num">ราคา</th>
                <th className="num">คงเหลือ</th>
                <th className="num">รูป</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  busy={busy === p.id}
                  editing={editing === p.id}
                  onToggleEdit={() => setEditing(editing === p.id ? null : p.id)}
                  run={run}
                />
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ProductRow({
  product: p,
  busy,
  editing,
  onToggleEdit,
  run,
}: {
  product: ProductDto;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  run: (id: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [price, setPrice] = useState(formatSatang(p.priceSatang));
  const [stock, setStock] = useState(String(p.stock));
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');

  return (
    <>
      <tr>
        <td>
          <strong>{p.name}</strong>
          {p.description ? <div className="faint">{p.description}</div> : null}
        </td>
        <td>
          <span className={`tag ${p.status}`}>{STATUS_LABEL[p.status]}</span>
        </td>
        <td className="num">
          <span className="baht">฿</span>
          {formatSatang(p.priceSatang)}
        </td>
        <td className="num">{p.stock}</td>
        <td className="num">{p.photoCount}</td>
        <td>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="secondary small" onClick={onToggleEdit}>
              {editing ? 'ปิด' : 'แก้ไข'}
            </button>
            {p.status === 'published' ? (
              <button
                type="button"
                className="secondary small"
                disabled={busy}
                onClick={() => run(p.id, () => api.post(`/products/${p.id}/unpublish`))}
              >
                ซ่อน
              </button>
            ) : (
              <button
                type="button"
                className="small"
                disabled={busy}
                onClick={() => run(p.id, () => api.post(`/products/${p.id}/publish`))}
              >
                เผยแพร่
              </button>
            )}
          </div>
        </td>
      </tr>

      {editing ? (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-sunk)' }}>
            <PhotoPanel product={p} busy={busy} run={run} />

            <div className="field">
              <label>ชื่อและคำอธิบาย</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <textarea
                style={{ marginTop: '.4rem' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                type="button"
                className="small"
                style={{ marginTop: '.4rem' }}
                disabled={busy}
                onClick={() =>
                  run(p.id, () => api.patch(`/products/${p.id}`, { name, description }))
                }
              >
                บันทึกชื่อ/คำอธิบาย
              </button>
            </div>

            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>ราคา (บาท)</label>
                <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
              </div>
              <button
                type="button"
                className="small"
                disabled={busy}
                onClick={() => {
                  const satang = parseBahtToSatang(price);
                  if (satang === null) return;
                  void run(p.id, () =>
                    api.patch(`/products/${p.id}/price`, { priceSatang: satang }),
                  );
                }}
              >
                เปลี่ยนราคา
              </button>

              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>คงเหลือ</label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="small"
                disabled={busy}
                onClick={() =>
                  run(p.id, () =>
                    api.patch(`/products/${p.id}/stock`, { stock: Number(stock) }),
                  )
                }
              >
                เปลี่ยนจำนวน
              </button>
            </div>

            <p className="faint" style={{ marginTop: '.75rem' }}>
              ราคาและจำนวนบันทึกแยกจากชื่อ เพราะแต่ละอย่างถูกบันทึกเป็นเหตุการณ์คนละชนิด
            </p>

            <button
              type="button"
              className="danger small"
              disabled={busy}
              onClick={() => {
                if (!confirm(`ลบ “${p.name}” ?`)) return;
                void run(p.id, () => api.delete(`/products/${p.id}`));
              }}
            >
              ลบสินค้า
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * PB-10 — photos.
 *
 * Two photos is the line the first recommendation is built around: one photo is
 * what the create form produces by default, so a count of one carries no
 * information about effort, while a second is the smallest visible change a
 * seller can make (detailed-design.md). The hint below says that in the
 * seller's language without mentioning the study.
 */
function PhotoPanel({
  product: p,
  busy,
  run,
}: {
  product: ProductDto;
  busy: boolean;
  run: (id: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void run(p.id, async () => {
      await api.upload(`/products/${p.id}/photos`, file);
      // Let the same file be chosen again after a failure or a delete.
      if (fileInput.current) fileInput.current.value = '';
    });
  }

  return (
    <div className="field">
      <label>รูปสินค้า</label>

      {p.photos.length === 0 ? (
        <p className="faint">ยังไม่มีรูป</p>
      ) : (
        <div className="photo-strip">
          {p.photos.map((photo) => (
            <div key={photo.id} className="photo-thumb">
              {/* Plain <img> rather than next/image: the URL is presigned and
                  expires in an hour, so the optimiser would cache a URL that
                  goes stale under it (ADR-0004). */}
              <img src={photo.url} alt="" />
              <button
                type="button"
                className="danger small"
                disabled={busy}
                onClick={() => {
                  if (!confirm('ลบรูปนี้?')) return;
                  void run(p.id, () =>
                    api.delete(`/products/${p.id}/photos/${photo.id}`),
                  );
                }}
              >
                ลบ
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={onPick}
        style={{ marginTop: '.5rem' }}
      />
      <div className="faint">JPEG, PNG หรือ WebP · ไม่เกิน 5 MB</div>

      {p.photos.length < 2 ? (
        <div className="faint" style={{ marginTop: '.3rem', color: 'var(--warn)' }}>
          สินค้าที่มีอย่างน้อย 2 รูป ผู้ซื้อจะเห็นภาพชัดขึ้น
        </div>
      ) : null}
    </div>
  );
}
