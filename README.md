# ColabGG — Cloud Gaming (Kiểu VaultBox: Auto Room ID + Cloudflare Relay + WebRTC UDP)

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/CeatursHarmginton/colab-gg/blob/main/ColabSteam.ipynb)

Biến máy ảo **Google Colab (NVIDIA T4 GPU)** thành máy chủ Cloud Gaming (Steam / Heroic / Linux Desktop) với cơ chế **kết nối 1 chạm giống hệt VaultBox**:
- Colab tự sinh **`Room ID` + `Connection Token`** (`COLABGG_CONNECT: {...}`) và tự copy vào Clipboard.
- Mở **Web Client trên trình duyệt** → bấm **Dán từ Clipboard** (hoặc bấm nút **Mở Web Client & Kết nối ngay** trên Colab) → **Vào thẳng màn hình Game**, bỏ hẳn `trycloudflare.com`, không cần đăng nhập `admin/admin`, không cần nhập mã PIN Moonlight!
- Truyền tải hình ảnh/âm thanh 1080p 60fps bằng **WebRTC UDP (qua Cloudflare Realtime TURN 1.000 GB/tháng miễn phí)** — không bị khựng hình TCP như bản gốc.

---

## ⚡ Bước chuẩn bị 1 lần duy nhất trên máy tính của bạn

1. **Deploy Worker `colabgg-relay` riêng lên tài khoản Cloudflare của bạn:**
   - Nháy đúp chạy file **[`DeployRelay.bat`](DeployRelay.bat)** (hoặc chạy `cd cloudflare/colabgg-relay && wrangler deploy`).
   - Sau khi chạy xong, bạn sẽ có địa chỉ Web Client & Relay cố định:
     `https://colabgg-relay.<subdomain-của-bạn>.workers.dev`
2. **(Khuyên dùng) Bật Cloudflare Realtime TURN UDP miễn phí 1 TB/tháng:**
   - Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → menu **Realtime (Calls) → TURN Apps** → bấm **Create** để lấy `Key ID` và `API Token`.
   - Nháy đúp chạy **[`SetupTurnSecrets.bat`](SetupTurnSecrets.bat)** và dán 2 mã đó vào. Từ lúc này Worker tự động cấp kênh truyền video **UDP thuần** cho cả Colab lẫn Trình duyệt!

---

## 🎮 Cách chơi mỗi lần mở Colab

1. Mở [Google Colab](https://colab.research.google.com) → **Upload** file **[`ColabSteam.ipynb`](ColabSteam.ipynb)**.
2. Chọn GPU: **Runtime → Change runtime type → T4 GPU** → **Save**.
3. Điền URL Worker của bạn vào ô `Relay_Server_URL` (mặc định đã điền sẵn `https://colabgg-relay.baocryptonft.workers.dev`) rồi bấm **Run**.
4. Sau ~3–5 phút cài đặt, thẻ **ColabGG Cloud Gaming Server is Ready** hiện ra:
   - Bấm thẳng nút **🚀 Mở Web Client & Kết nối ngay**, **HOẶC**
   - Chạy **[`OpenWebClient.bat`](OpenWebClient.bat)** / mở link Worker trên bất kỳ trình duyệt nào → bấm **📋 Dán từ Clipboard** → bấm **🖥️ Vào thẳng Màn hình Desktop (1-Click)**!

*(Tùy chọn nâng cao)*: Nếu bạn muốn dùng thêm **App Moonlight gốc + Cloudflare WARP** song song với Web Client, chỉ cần điền `CF_ZeroTrust_Tunnel_Token` ở ô cấu hình trong Notebook.

---

## 📂 Cấu trúc dự án

- [`cloudflare/colabgg-relay/`](cloudflare/colabgg-relay/) — Cloudflare Worker + Durable Object (`ColabGGRoom`) + Giao diện Web Client (`public/index.html` & `public/moonlight/`).
- [`colab/colab_relay_agent.py`](colab/colab_relay_agent.py) — Agent chạy trên Colab kết nối WebSocket ra Worker, tự động đăng nhập ngầm, cấu hình TURN UDP và cầu nối luồng điều khiển.
- [`ColabSteam.ipynb`](ColabSteam.ipynb) — Notebook Server Launcher tự động đóng gói toàn bộ script (upload 1 file duy nhất lên Colab là chạy).
- [`colab-moonweb.sh`](colab-moonweb.sh) & [`moon-pair.sh`](moon-pair.sh) — Bộ script cài đặt Linux/GPU/Sunshine/Moonlight-Web đã sửa toàn bộ lỗi gốc.
- [`DeployRelay.bat`](DeployRelay.bat), [`SetupTurnSecrets.bat`](SetupTurnSecrets.bat), [`OpenWebClient.bat`](OpenWebClient.bat) — Công cụ triển khai & mở nhanh trên Windows.
