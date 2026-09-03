'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  STORE_CATEGORIES,
  STORE_CATEGORY_LABELS_TH,
  type StoreDto,
} from '@dtbi/shared';
import { api, ApiRequestError } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';

/**
 * PB-07 — store profile create and edit.
 *
 * One form for both. A seller has exactly one store (unique constraint on
 * owner_id), so "create" and "edit" are the same screen at two moments rather
 * than two screens.
 */
export default function StorePage() {
  const { state, reload } = useMe();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  if (state.status !== 'signed-in') return null;
  const store = state.me.store;
  const isCreate = store === null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, string> = {
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? ''),
      category: String(form.get('category') ?? ''),
      contactChannel: String(form.get('contactChannel') ?? ''),
    };

    try {
      if (isCreate) {
        const slug = String(form.get('slug') ?? '').trim();
        await api.post<{ store: StoreDto }>('/stores', {
          ...payload,
          ...(slug ? { slug } : {}),
        });
        await reload();
        router.push('/dashboard');
      } else {
        await api.patch<{ store: StoreDto }>(`/stores/${store.id}`, payload);
        await reload();
        setSaved(true);
        setPending(false);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.thaiMessage);
        setFieldErrors(err.details);
      } else {
        setError('เกิดข้อผิดพลาด');
      }
      setPending(false);
    }
  }

  return (
    <>
      <h1>{isCreate ? 'สร้างร้านของคุณ' : 'ข้อมูลร้าน'}</h1>
      <p className="muted">
        {isCreate
          ? 'ผู้ขายหนึ่งคนมีได้หนึ่งร้าน'
          : 'แก้ไขข้อมูลที่ผู้ซื้อจะเห็น'}
      </p>

      <form className="card" onSubmit={onSubmit} noValidate>
        {error ? <div className="error">{error}</div> : null}
        {saved ? (
          <div className="error" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
            บันทึกแล้ว
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="name">ชื่อร้าน</label>
          <input id="name" name="name" required defaultValue={store?.name ?? ''} />
          {fieldErrors.name ? <div className="field-error">{fieldErrors.name}</div> : null}
        </div>

        {isCreate ? (
          <div className="field">
            <label htmlFor="slug">URL ของร้าน (ไม่บังคับ)</label>
            <input id="slug" name="slug" placeholder="my-shop" pattern="[a-z0-9-]*" />
            <div className="faint">
              ใช้ a-z, 0-9 และ - เท่านั้น · เว้นว่างไว้เพื่อให้ระบบสร้างให้
            </div>
            {fieldErrors.slug ? <div className="field-error">{fieldErrors.slug}</div> : null}
          </div>
        ) : (
          <div className="field">
            <label>URL ของร้าน</label>
            <p className="mono muted">/{store.slug}</p>
            <div className="faint">
              เปลี่ยนไม่ได้ — ลิงก์ที่ผู้ซื้อบันทึกไว้จะใช้ไม่ได้
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="category">หมวดหมู่</label>
          <select id="category" name="category" required defaultValue={store?.category ?? ''}>
            <option value="" disabled>
              เลือกหมวดหมู่
            </option>
            {STORE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {STORE_CATEGORY_LABELS_TH[c]}
              </option>
            ))}
          </select>
          {fieldErrors.category ? (
            <div className="field-error">{fieldErrors.category}</div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="description">คำอธิบายร้าน</label>
          <textarea
            id="description"
            name="description"
            defaultValue={store?.description ?? ''}
          />
        </div>

        <div className="field">
          <label htmlFor="contactChannel">ช่องทางติดต่อ</label>
          <input
            id="contactChannel"
            name="contactChannel"
            placeholder="@line-id หรือเบอร์โทร"
            defaultValue={store?.contactChannel ?? ''}
          />
          <div className="faint">ผู้ซื้อจะเห็นข้อมูลนี้บนหน้าร้าน</div>
        </div>

        <button type="submit" disabled={pending}>
          {pending ? 'กำลังบันทึก…' : isCreate ? 'สร้างร้าน' : 'บันทึก'}
        </button>
      </form>
    </>
  );
}
