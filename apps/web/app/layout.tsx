import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'dtbimarket — ตลาดนักศึกษา มฟล.',
  description: 'แพลตฟอร์มร้านค้าสำหรับธุรกิจนักศึกษา มหาวิทยาลัยแม่ฟ้าหลวง',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Sarabun:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
