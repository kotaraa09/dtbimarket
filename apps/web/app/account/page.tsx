'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { USER_ROLE_LABELS_TH } from '@dtbi/shared';
import { api } from '../../lib/api';
import { useMe } from '../../lib/use-me';
import { homePathFor } from '../../lib/roles';

/**
 * The buyer's account page.
 *
 * Buyers can register and sign in (FEAT-A2), and that is genuinely all they can
 * do yet — the catalogue, storefront, cart and orders are M2. The page says so
 * rather than showing an empty shell that implies something is broken.
 *
 * Note on Q-3: whether buyers may check out as guests is still undecided, and
 * it stays undecided. It governs `Order.buyer_id`, which nothing here touches.
 */
export default function AccountPage() {
  const { state } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/signin');
  }, [state.status, router]);

  useEffect(() => {
    if (state.status === 'signed-in' && state.me.user.role !== 'buyer') {
      router.replace(homePathFor(state.me.user.role));
    }
  }, [state, router]);

  if (state.status !== 'signed-in' || state.me.user.role !== 'buyer') {
    return (
      <main className="shell">
        <p className="muted">กำลังโหลด…</p>
      </main>
    );
  }

  async function signOut() {
    await api.post('/auth/logout');
    router.replace('/signin');
  }

  return (
    <main className="shell narrow" style={{ paddingTop: '2.5rem' }}>
      <div className="spread">
        <div>
          <h1>{state.me.user.displayName}</h1>
          <p className="muted">{USER_ROLE_LABELS_TH.buyer}</p>
        </div>
        <button type="button" className="secondary small" onClick={signOut}>
          ออกจากระบบ
        </button>
      </div>

      <div className="card">
        <h2>ยังไม่เปิดให้ใช้งาน</h2>
        <p className="muted">
          หน้ารวมสินค้า หน้าร้าน ตะกร้า และการสั่งซื้อ ยังไม่ได้สร้าง (M2)
          ตอนนี้บัญชีผู้ซื้อใช้สำหรับเข้าสู่ระบบเท่านั้น
        </p>
        <p className="faint">
          <Link href="/">กลับหน้าแรก</Link>
        </p>
      </div>
    </main>
  );
}
