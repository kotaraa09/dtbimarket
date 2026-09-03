'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { UserDto } from '@dtbi/shared';
import { api, ApiRequestError } from '../../lib/api';

export default function SignInPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      await api.post<{ user: UserDto }>('/auth/login', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.thaiMessage : 'เกิดข้อผิดพลาด',
      );
      setPending(false);
    }
  }

  return (
    <main className="shell narrow" style={{ paddingTop: '3rem' }}>
      <h1>เข้าสู่ระบบ</h1>

      <form className="card" onSubmit={onSubmit} noValidate>
        {error ? <div className="error">{error}</div> : null}

        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>

        <button type="submit" disabled={pending}>
          {pending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <p className="faint">
        ยังไม่มีบัญชี? <Link href="/signup">สมัครเป็นผู้ขาย</Link>
      </p>
    </main>
  );
}
