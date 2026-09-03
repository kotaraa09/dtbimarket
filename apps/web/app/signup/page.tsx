'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { UserDto } from '@dtbi/shared';
import { api, ApiRequestError } from '../../lib/api';

export default function SignUpPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    try {
      await api.post<{ user: UserDto }>('/auth/register', {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        displayName: String(form.get('displayName') ?? ''),
        role: 'seller',
      });
      // The API set the session cookie on the response.
      router.push('/dashboard');
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
    <main className="shell narrow" style={{ paddingTop: '3rem' }}>
      <h1>สมัครเป็นผู้ขาย</h1>
      <p className="muted">ใช้อีเมลมหาวิทยาลัยหรืออีเมลส่วนตัวก็ได้</p>

      <form className="card" onSubmit={onSubmit} noValidate>
        {error ? <div className="error">{error}</div> : null}

        <div className="field">
          <label htmlFor="displayName">ชื่อที่แสดง</label>
          <input id="displayName" name="displayName" required autoComplete="name" />
          {fieldErrors.displayName ? (
            <div className="field-error">{fieldErrors.displayName}</div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          {fieldErrors.email ? (
            <div className="field-error">{fieldErrors.email}</div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
          />
          <div className="faint">อย่างน้อย 8 ตัวอักษร</div>
          {fieldErrors.password ? (
            <div className="field-error">{fieldErrors.password}</div>
          ) : null}
        </div>

        <button type="submit" disabled={pending}>
          {pending ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
        </button>
      </form>

      <p className="faint">
        มีบัญชีอยู่แล้ว? <Link href="/signin">เข้าสู่ระบบ</Link>
      </p>
    </main>
  );
}
