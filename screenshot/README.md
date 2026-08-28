# screenshot

ภาพ export ของแบบหน้าจอ ใช้แนบในรายงานและสไลด์ ไฟล์ต้นทางอยู่ใน `docs/02-design/prototypes/`

| ไฟล์ | ต้นทาง | เนื้อหา |
|---|---|---|
| `PR-01-wireframe-seller-dashboard.png` | `docs/02-design/prototypes/PR-01-wireframe.html` | Wireframe แดชบอร์ดผู้ขาย 3 เฟรม (แดชบอร์ด / เพิ่มรูปสินค้า / สถานะอื่น) พร้อมหมายเหตุ 9 ข้อ |

## สร้างภาพใหม่หลังแก้ไฟล์ต้นทาง

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1440,880 --screenshot="E:\WebWork\dtbimarket\screenshot\PR-01-wireframe-seller-dashboard.png" "file:///E:/WebWork/dtbimarket/docs/02-design/prototypes/PR-01-wireframe.html"
```

`--force-device-scale-factor=2` ทำให้ได้ภาพ 2 เท่า (2880 × 1760) คมพอสำหรับพิมพ์ ถ้าแก้ไฟล์ต้นทางแล้วเนื้อหายาวขึ้น ให้เพิ่มค่าหลังของ `--window-size` ตามความสูงจริง

แก้ที่ HTML แล้ว export ใหม่เสมอ อย่าแก้ภาพโดยตรง — ภาพที่แก้ทับจะไม่ตรงกับต้นทางและไม่มีใครรู้ว่าอันไหนถูก
