# Tenten VPS deployment checklist

1. Tạo VPS có public IPv4 và mở inbound TCP `80`/`443`. Không mở `8787`.
2. Trỏ bản ghi DNS tại Tenten: `api` / `A` / `<VPS_PUBLIC_IPV4>`.
3. Chờ DNS phân giải rồi kiểm tra `api.jersevo.com` trỏ đúng VPS.
4. Cài Docker + Docker Compose trên VPS.
5. Copy repository, copy `.env.backend.example` thành `.env.backend`, điền
   secret server và `TLS_EMAIL`.
6. Chạy `docker compose -f docker-compose.production.yml up -d --build`.
7. Kiểm tra `https://api.jersevo.com/health` và `/ready`.
8. Trỏ PayPal/Paddle webhook tới
   `https://api.jersevo.com/api/payment-webhook`.
9. Thêm vào Vercel:

   ```env
   VITE_SUPABASE_FUNCTIONS_URL=https://PROJECT.supabase.co/functions/v1
   VITE_BACKEND_URL=https://api.jersevo.com
   ```

10. Redeploy frontend, kiểm tra checkout sandbox và webhook retry trước khi
    bật payment live.

DNS hiện tại của `jersevo.com` đang dùng Vercel cho `@` và `www`. Chỉ thêm
record `api` sau khi đã có VPS public IPv4; không thay đổi hai record hiện tại.
