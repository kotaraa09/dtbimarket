import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell narrow" style={{ paddingTop: '4rem' }}>
      <h1>dtbimarket</h1>
      <p className="muted">
        ตลาดออนไลน์สำหรับธุรกิจนักศึกษา มหาวิทยาลัยแม่ฟ้าหลวง
      </p>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2>สำหรับผู้ขาย</h2>
        <p className="muted">
          สร้างร้าน เพิ่มสินค้า และดูว่าร้านของคุณเป็นอย่างไร
        </p>
        <div className="row" style={{ marginTop: '1rem' }}>
          <Link href="/signup">
            <button type="button">สมัครเป็นผู้ขาย</button>
          </Link>
          <Link href="/signin">
            <button type="button" className="secondary">
              เข้าสู่ระบบ
            </button>
          </Link>
        </div>
      </div>

      <p className="faint">
        ส่วนของผู้ซื้อ — หน้ารวมสินค้าและหน้าร้าน — ยังไม่เปิด (PB-12)
      </p>
    </main>
  );
}
