# Kích hoạt nền tảng Admin — đợt 1

## Trạng thái hiện tại

Hai migration foundation và scoped admin đã được áp dụng trên Supabase project `jpbrwfctgrufbdkstufq` sau khi người dùng xác nhận. Kiểm tra dữ liệu ban đầu: 6 listings, 11 variants; nội dung listings/variants không thay đổi. RLS vẫn bật, anonymous không được gọi RPC. Quyền `app_metadata.extra_time_role = admin` đã được cấp riêng cho đúng tài khoản hiện có do người dùng chỉ định; role chung `ADMIN` và các metadata khác được giữ nguyên. Người quản trị cần đăng xuất/đăng nhập lại để JWT nhận claim mới. Chưa kiểm thử lưu qua phiên đăng nhập thật, chưa promote bản preview lên production.

## Đã triển khai trong code

- Cổng đăng nhập Supabase Auth; chỉ `app_metadata.extra_time_role = admin` được mở Admin. Không suy ra quyền từ role chung của ứng dụng khác.
- ID/SKU riêng cho listing mới, chuẩn hóa dữ liệu từ database.
- Listing save dùng một RPC duy nhất; không lưu tuần tự rồi bỏ qua lỗi variations.
- Ma trận variants có thêm/sửa options, tạo tổ hợp thiếu, giữ giá/SKU đã chỉnh, lưu trữ tổ hợp không còn dùng và sửa giá hàng loạt.
- Dashboard đếm listing/variant/template từ dữ liệu đang tải thay cho số liệu mẫu.
- Cảnh báo khi dữ liệu lỗi; không thay catalogue lỗi bằng sản phẩm demo.

## Quy trình kích hoạt / tham khảo cho môi trường mới

1. Mở đúng project Supabase của website, kiểm tra/backup dữ liệu trước thay đổi schema.
2. Chạy lần lượt `supabase/migrations/20260916_listing_foundation.sql` và `supabase/migrations/20260916_scoped_admin.sql`, không chạy lại file seed `schema.sql` trên production.
3. Migration bổ sung SKU ở listing, các ràng buộc chống trùng, RPC atomic và quyền ghi audit log của admin. Nó không cấp role cho user, không xóa hay seed lại catalogue. Nếu dữ liệu cũ có SKU/tổ hợp trùng, unique index sẽ báo lỗi và transaction migration dừng; cần xử lý dữ liệu trùng trước, không bỏ ràng buộc.
4. Chủ project chuẩn bị một tài khoản **Supabase Auth của ứng dụng**, không phải chỉ tài khoản đăng nhập dashboard Supabase. Sau xác nhận đúng tài khoản, thêm `app_metadata.extra_time_role = admin` bằng công cụ quản trị tin cậy, giữ nguyên metadata khác; không dùng `user_metadata` và không đưa service-role key vào trình duyệt.
5. Người quản trị tự đăng nhập tại `/admin`. Không gửi mật khẩu/API key trong chat.
6. Kiểm tra tạo draft → thêm options → generate variants → chọn active → lưu → tải lại. Chỉ xuất bản khi có ảnh chính và ít nhất một variant active.

RPC chưa được cài sẽ trả lỗi rõ ràng; không chạy lại cách lưu từng bảng không an toàn. Kiểm thử migration trong PGlite là PostgreSQL cô lập, không phải bằng chứng migration đã được áp dụng trên database production.

## Giới hạn / đợt tiếp theo

Storefront hiện chưa chuyển sang đọc catalogue Admin; việc rollout nguồn dữ liệu chung và media/listing editor đầy đủ thuộc đợt 2. Đợt 3 bổ sung Custom Requests, phiên bản template, duyệt mẫu, AI jobs. Đợt 4 hoàn thiện Theme/Menus/Collections dùng chung renderer. Chưa coi những phần này là hoàn tất.

Đã kiểm thử unit + PostgreSQL transaction, anonymous/non-admin denial, stale write, rollback khi SKU trùng và lưu trữ variant. Giao diện đăng nhập và component ma trận được kiểm tra riêng; chưa dùng tài khoản admin thật hay tạo bản ghi test ở production.
