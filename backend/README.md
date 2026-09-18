# Jersevo API backend

Đây là runtime Node dành cho các route cần upload/image/AI/payment hoặc quyền
admin. Adapter gọi lại các handler trong `api/` để giữ business logic và khả
năng rollback với Vercel trong giai đoạn chuyển đổi.

## Chạy local

```bash
npm run backend:dev
```

Biến tối thiểu:

```env
PORT=8787
ALLOWED_ORIGINS=http://localhost:5173,https://www.jersevo.com,https://jersevo.com
SITE_URL=https://www.jersevo.com
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-key
```

Thêm các biến AI/PayPal/Paddle trong `.env` server. Không đặt chúng với tiền
tố `VITE_` và không commit file secrets.

Liveness check: `GET /health`. Readiness check: `GET /ready`; readiness trả
`503` và chỉ nêu tên biến còn thiếu, không bao giờ trả giá trị secret.

## Đưa lên VPS/Cloud Run

Expose port `8787` qua reverse proxy với HTTPS (ví dụ `api.jersevo.com`) và
đặt `VITE_BACKEND_URL=https://api.jersevo.com` trong frontend. Cấu hình DNS
`api` trỏ tới load balancer/VPS; webhook PayPal/Paddle trỏ tới
`https://api.jersevo.com/api/payment-webhook`.

Mẫu production đầy đủ nằm ở `docker-compose.production.yml` và
`deploy/Caddyfile`. Sau khi DNS `api` trỏ đúng IP VPS, Caddy tự cấp và gia hạn
TLS. Chỉ mở cổng 80/443; cổng 8787 chỉ được expose trong Docker network.

Node backend không phát hành JWT/service-role key cho browser. Supabase Auth
access token chỉ đi trong `Authorization` để handler kiểm tra quyền.
