'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ANONYMISED_FIELDS,
  USER_ROLE_LABELS_TH,
  USER_STATUS_LABELS_TH,
  type AdminUserDetailDto,
} from '@dtbi/shared';
import { api, ApiRequestError } from '../../../../lib/api';
import { useMe } from '../../../../lib/use-me';

/**
 * One user, including their personal data — which is what makes opening this
 * page an auditable disclosure (REQ-N21, ADR-0005). The banner says so, because
 * an operator should know when they are generating a record, not discover it
 * afterwards.
 */
export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state } = useMe();
  const [user, setUser] = useState<AdminUserDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = params.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      setUser(await api.get<AdminUserDetailDto>(`/admin/users/${id}`));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.thaiMessage : 'โหลดไม่สำเร็จ');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.thaiMessage : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (error && !user) {
    return (
      <>
        <div className="error">{error}</div>
        <Link href="/admin">← กลับไปรายการผู้ใช้</Link>
      </>
    );
  }

  if (!user) return <p className="muted">กำลังโหลด…</p>;

  const isSelf =
    state.status === 'signed-in' && state.me.user.id === user.id;

  return (
    <>
      <p className="faint">
        <Link href="/admin">← รายการผู้ใช้</Link>
      </p>

      <div className="spread">
        <div>
          <h1>{user.displayName}</h1>
          <p className="muted mono">{user.id}</p>
        </div>
        <div className="row">
          <span className={`tag status-${user.status}`}>
            {USER_STATUS_LABELS_TH[user.status]}
          </span>
          <span className="tag draft">{USER_ROLE_LABELS_TH[user.role]}</span>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="notice">
        การเปิดหน้านี้ถูกบันทึกไว้ในบันทึกการใช้งาน พร้อมรายชื่อฟิลด์ที่เปิดดู
        (ไม่ได้บันทึกค่าข้อมูล)
      </div>

      <div className="card">
        <h2>ข้อมูลส่วนบุคคล</h2>
        <dl className="kv">
          <dt>อีเมล</dt>
          <dd className="mono">{user.email}</dd>
          <dt>ชื่อที่แสดง</dt>
          <dd>{user.displayName}</dd>
          <dt>สมัครเมื่อ</dt>
          <dd>{new Date(user.createdAt).toLocaleString('th-TH')}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>ร้าน</h2>
        {user.store ? (
          <dl className="kv">
            <dt>ชื่อร้าน</dt>
            <dd>{user.store.name}</dd>
            <dt>URL</dt>
            <dd className="mono">/{user.store.slug}</dd>
            <dt>ช่องทางติดต่อ</dt>
            <dd>{user.store.contactChannel ?? '—'}</dd>
          </dl>
        ) : (
          <p className="muted">ยังไม่มีร้าน</p>
        )}
      </div>

      <div className="card">
        <h2>การจัดการบัญชี</h2>

        {isSelf ? (
          <p className="muted">
            นี่คือบัญชีของคุณเอง จึงดำเนินการกับบัญชีนี้ไม่ได้
          </p>
        ) : user.status === 'anonymised' ? (
          <p className="muted">
            บัญชีนี้ถูกลบข้อมูลส่วนบุคคลถาวรแล้ว กู้คืนไม่ได้
          </p>
        ) : (
          <>
            <div className="row">
              {user.status === 'active' ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.post(`/admin/users/${user.id}/suspend`))
                  }
                >
                  ระงับบัญชี
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.post(`/admin/users/${user.id}/reinstate`))
                  }
                >
                  คืนสถานะบัญชี
                </button>
              )}
            </div>

            <p className="faint" style={{ marginTop: '.5rem' }}>
              การระงับบัญชีจะยกเลิกเซสชันที่เปิดอยู่ทั้งหมดทันที
            </p>

            <hr style={{ margin: '1rem 0', border: 0, borderTop: '1px solid var(--line)' }} />

            <h3 style={{ fontSize: '.95rem', margin: '0 0 .4rem' }}>
              ลบข้อมูลส่วนบุคคล (PDPA)
            </h3>
            <p className="muted">
              ใช้เมื่อเจ้าของข้อมูลขอให้ลบข้อมูล ระบบจะลบ{' '}
              <span className="mono">{ANONYMISED_FIELDS.join(', ')}</span>{' '}
              และปิดร้าน แต่จะไม่ลบข้อมูลเชิงพฤติกรรม
              ซึ่งอ้างอิงด้วยรหัสและไม่มีข้อมูลส่วนบุคคลอยู่แล้ว
            </p>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                const typed = prompt(
                  'การกระทำนี้ย้อนกลับไม่ได้ พิมพ์ anonymise เพื่อยืนยัน',
                );
                if (typed !== 'anonymise') return;
                void act(async () => {
                  await api.post(`/admin/users/${user.id}/anonymise`, {
                    confirm: 'anonymise',
                  });
                  router.refresh();
                });
              }}
            >
              ลบข้อมูลส่วนบุคคลถาวร
            </button>
          </>
        )}
      </div>
    </>
  );
}
