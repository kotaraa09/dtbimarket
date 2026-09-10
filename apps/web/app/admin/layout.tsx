'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/use-me';
import { homePathFor } from '../../lib/roles';

/**
 * The administrator area.
 *
 * This guard is a convenience, not the security boundary. Every route under
 * /api/v1/admin refuses a non-admin on the server, and a client-side check can
 * always be bypassed by someone who wants to — so it exists to avoid showing a
 * seller a page of 403s, nothing more.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/signin');
  }, [state.status, router]);

  useEffect(() => {
    if (state.status === 'signed-in' && state.me.user.role !== 'admin') {
      router.replace(homePathFor(state.me.user.role));
    }
  }, [state, router]);

  if (state.status !== 'signed-in' || state.me.user.role !== 'admin') {
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

  const link = (href: string, label: string) => (
    <Link href={href} aria-current={pathname === href ? 'page' : undefined}>
      {label}
    </Link>
  );

  return (
    <>
      <header className="topbar admin">
        <div className="topbar-inner">
          <Link href="/admin" className="brand">
            dtbimarket · ผู้ดูแลระบบ
          </Link>
          <nav>
            {link('/admin', 'ผู้ใช้')}
            {link('/admin/audit', 'บันทึกการใช้งาน')}
          </nav>
          <button type="button" className="secondary small" onClick={signOut}>
            ออกจากระบบ
          </button>
        </div>
      </header>
      <main className="shell">{children}</main>
    </>
  );
}
