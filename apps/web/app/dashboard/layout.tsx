'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useMe } from '../../lib/use-me';

export default function DashboardLayout({
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

  // A seller with no store can only be on the store page — everything else
  // needs a store to scope to, and the API would refuse anyway (404
  // store_not_found from the store-scope middleware).
  useEffect(() => {
    if (
      state.status === 'signed-in' &&
      state.me.store === null &&
      pathname !== '/dashboard/store'
    ) {
      router.replace('/dashboard/store');
    }
  }, [state, pathname, router]);

  if (state.status !== 'signed-in') {
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
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard" className="brand">
            dtbimarket
          </Link>
          <nav>
            {link('/dashboard', 'ภาพรวม')}
            {link('/dashboard/products', 'สินค้า')}
            {link('/dashboard/store', 'ข้อมูลร้าน')}
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
