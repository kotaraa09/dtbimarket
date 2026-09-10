'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  USER_ROLES,
  USER_ROLE_LABELS_TH,
  USER_STATUSES,
  USER_STATUS_LABELS_TH,
  type AdminUserSummaryDto,
  type Paginated,
  type UserRole,
  type UserStatus,
} from '@dtbi/shared';
import { api, ApiRequestError } from '../../lib/api';

/**
 * The user list.
 *
 * Shows IDs, roles, statuses and dates — no names, no email addresses. That is
 * deliberate: browsing to find an account should not itself be a disclosure of
 * personal data. The detail page is where names appear, and opening it writes
 * an audit entry recording exactly which fields were revealed (ADR-0005).
 */
export default function AdminUsersPage() {
  const [page, setPage] = useState<Paginated<AdminUserSummaryDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    try {
      setPage(
        await api.get<Paginated<AdminUserSummaryDto>>(
          `/admin/users?${params.toString()}`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.thaiMessage : 'โหลดไม่สำเร็จ');
      setPage({ items: [], nextCursor: null });
    }
  }, [role, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="spread">
        <div>
          <h1>ผู้ใช้</h1>
          <p className="muted">
            รายการนี้ไม่แสดงชื่อหรืออีเมล · เปิดหน้ารายละเอียดเพื่อดูข้อมูลส่วนบุคคล
            ซึ่งจะถูกบันทึกไว้
          </p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="row" style={{ marginBottom: '.75rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="role">บทบาท</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole | '')}
            >
              <option value="">ทั้งหมด</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS_TH[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="status">สถานะ</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus | '')}
            >
              <option value="">ทั้งหมด</option>
              {USER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {USER_STATUS_LABELS_TH[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {page === null ? (
          <p className="muted">กำลังโหลด…</p>
        ) : page.items.length === 0 ? (
          <div className="empty">
            <p>ไม่พบผู้ใช้</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>รหัสผู้ใช้</th>
                  <th>บทบาท</th>
                  <th>สถานะ</th>
                  <th>ร้าน</th>
                  <th>สมัครเมื่อ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {page.items.map((u) => (
                  <tr key={u.id}>
                    <td className="mono">{u.id.slice(0, 12)}…</td>
                    <td>{USER_ROLE_LABELS_TH[u.role]}</td>
                    <td>
                      <span className={`tag status-${u.status}`}>
                        {USER_STATUS_LABELS_TH[u.status]}
                      </span>
                      {u.isSeed ? <span className="tag draft">ตัวอย่าง</span> : null}
                    </td>
                    <td className="muted">{u.hasStore ? 'มี' : '—'}</td>
                    <td className="muted">
                      {new Date(u.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link href={`/admin/users/${u.id}`}>
                        <button type="button" className="secondary small">
                          รายละเอียด
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page?.nextCursor ? (
          <p className="faint" style={{ marginTop: '.75rem' }}>
            ยังมีรายการเพิ่มเติม — ใช้ตัวกรองเพื่อจำกัดผลลัพธ์
          </p>
        ) : null}
      </div>
    </>
  );
}
