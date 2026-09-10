'use client';

import { useEffect, useState } from 'react';
import type { AdminAuditEntryDto, Paginated } from '@dtbi/shared';
import { api, ApiRequestError } from '../../../lib/api';

/**
 * The operator trail.
 *
 * Readable by administrators and alterable by nobody: the database refuses
 * UPDATE and DELETE on this table whoever is connected, so an admin cannot
 * remove their own entries. Opening this page is itself recorded.
 */
const ACTION_LABELS_TH: Record<string, string> = {
  'admin.account_created': 'สร้างบัญชีผู้ดูแล',
  'admin.signed_in': 'ผู้ดูแลเข้าสู่ระบบ',
  'admin.users_listed': 'ดูรายการผู้ใช้',
  'admin.user_viewed': 'เปิดดูข้อมูลผู้ใช้',
  'admin.audit_viewed': 'ดูบันทึกการใช้งาน',
  'admin.user_suspended': 'ระงับบัญชี',
  'admin.user_reinstated': 'คืนสถานะบัญชี',
  'admin.user_anonymised': 'ลบข้อมูลส่วนบุคคล',
};

export default function AdminAuditPage() {
  const [page, setPage] = useState<Paginated<AdminAuditEntryDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Paginated<AdminAuditEntryDto>>('/admin/audit')
      .then(setPage)
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.thaiMessage : 'โหลดไม่สำเร็จ');
        setPage({ items: [], nextCursor: null });
      });
  }, []);

  return (
    <>
      <h1>บันทึกการใช้งานของผู้ดูแล</h1>
      <p className="muted">
        บันทึกนี้แก้ไขหรือลบไม่ได้ แม้แต่โดยผู้ดูแลเอง · รวมถึงการเปิดดูข้อมูล
        ไม่ใช่เฉพาะการแก้ไข
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        {page === null ? (
          <p className="muted">กำลังโหลด…</p>
        ) : page.items.length === 0 ? (
          <div className="empty">
            <p>ยังไม่มีบันทึก</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>การกระทำ</th>
                  <th>ผู้ดูแล</th>
                  <th>เป้าหมาย</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(e.occurredAt).toLocaleString('th-TH')}
                    </td>
                    <td>{ACTION_LABELS_TH[e.action] ?? e.action}</td>
                    <td className="mono">{e.actorId.slice(0, 10)}…</td>
                    <td className="mono">
                      {e.targetId ? `${e.targetId.slice(0, 10)}…` : '—'}
                    </td>
                    <td className="faint mono">
                      {Object.entries(e.metadata)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
