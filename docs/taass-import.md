# TAASS catalogue sync (không API)

## Chỉ nhập áo jersey

Đây là lệnh dành cho yêu cầu đồng bộ áo jersey. Bộ lọc chọn URL có `trikot`/`jersey`, sau đó kiểm tra loại sản phẩm trên trang để loại mũ, áo thun và trading card có chữ “jersey” trong tên. Trong sitemap kiểm tra ngày 23/09/2026 có 1.225 family URL ứng viên; số listing jersey thực tế có thể thấp hơn sau bước xác minh.

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
npm run import:taass:jerseys -- --limit 5
npm run sync:taass:jerseys -- --limit 5
npm run sync:taass:jerseys -- --all
```

Với danh mục lớn, có thể lưu giá, tồn kho và variants trước rồi backfill ảnh. Hai lượt dùng checkpoint riêng:

```powershell
$env:TAASS_IMPORT_CHECKPOINT = 'artifacts/taass-jerseys-metadata-checkpoint.json'
npm run sync:taass:jerseys:metadata -- --all
$env:TAASS_MEDIA_BACKFILL_SKUS_FILE = 'artifacts/taass-jerseys-metadata-checkpoint.json'
$env:TAASS_IMPORT_CHECKPOINT = 'artifacts/taass-jerseys-images-checkpoint.json'
npm run sync:taass:jerseys -- --all --media-backfill-only
```

Lệnh đọc thử mặc định không ghi Supabase. Lệnh sync tạo listing mới ở `DRAFT`, variant `ACTIVE`, tồn kho `1000` cho mỗi variant và giá bán lấy số EUR theo tỷ lệ `1:1` sang USD. SEO ở `BLOCKED` cho đến khi kiểm tra quyền sử dụng nội dung/ảnh và duyệt listing. Khi chạy tiếp, các listing jersey TAASS đã tạo trước đó được cập nhật lại cùng chính sách giá/tồn kho; listing của nguồn khác không bị chạm tới. Ảnh được tải về Storage theo đường dẫn ổn định và tối ưu AVIF, mục tiêu 48 KB/ảnh. Có thể chạy lại bằng checkpoint sau khi gián đoạn.

Các lệnh `import:taass` và `sync:taass` phía dưới là luồng nhập *toàn bộ* danh mục, có quy tắc giá/tồn kho khác; không dùng chúng cho lượt nhập chỉ áo jersey.

Importer `scripts/import-taass-catalog.mjs` đọc sitemap và HTML sản phẩm công khai do Shopware render sẵn, vì vậy không cần API key của TAASS. Luồng này chỉ nên bật sau khi đã xác nhận quyền sử dụng catalog, nội dung và hình ảnh nguồn.

Importer được thiết kế an toàn theo cách đang dùng cho Fan Gear Spot:

- nhóm các URL size/variant theo mã family 6 chữ số;
- tạo ID và SKU bằng hash ổn định để chạy lại không sinh bản ghi trùng;
- listing mới ở `DRAFT`, mọi variant được đặt `ACTIVE`;
- mỗi variant có tồn kho POD mặc định `1000`;
- URL hình từ TAASS không được ghi trực tiếp vào listing công khai;
- media chỉ được tải, làm sạch và upload sang storage của dự án khi có `--media`;
- khi đồng bộ lại, trạng thái listing đã publish, media và field tùy biến hiện có được giữ lại; variant được đặt `ACTIVE` theo cấu hình import;
- lưu từng lô và checkpoint, tự động chạy tiếp các family chưa xong sau khi gián đoạn.
- gán `taxonomy.category` theo loại hàng (jersey theo môn, apparel, accessories, collectibles) và liên kết listing với collection league/loại hàng, cùng team collection nếu đã tồn tại;
- collection mới ở `DRAFT`; collection sẵn có giữ nguyên status và thứ tự merchandising cũ.

## Dry-run đọc thử

Mặc định chỉ đọc 25 product family và ghi report cục bộ, không ghi Supabase:

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
npm run import:taass -- --dry-run
```

Kiểm tra một family cụ thể:

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
npm run import:taass -- --dry-run --source-code 806454
```

Report được ghi tại `artifacts/taass-import-report.json`. Có thể dùng `--limit N`, `--offset N`, `--language en|de`, hoặc `--url <TAASS_PRODUCT_URL>` cho pilot hẹp.

## Ghi draft vào Supabase

Chỉ dùng service-role key ở server shell/CI secret store, không đặt key vào biến `VITE_*`:

Trong Supabase Dashboard của dự án **Extra Time US**, mở **Project Settings → API Keys → Legacy anon, service_role API keys**, rồi chọn **Reveal → Copy** tại hàng `service_role`. Dán giá trị vào `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local` (đã được Git bỏ qua). `SUPABASE_URL` là `https://ofetusgarxcwloxxkhnr.supabase.co`. Không dán khóa vào chat, commit hay biến `VITE_*`.

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
$env:SUPABASE_URL = 'https://<project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<server-only key>'
npm run sync:taass -- --limit 25
```

Sau pilot, đồng bộ toàn bộ product family trong sitemap và đủ ảnh của từng listing:

```powershell
npm run sync:taass -- --all --media
```

`--all` bỏ giới hạn số sản phẩm; `--batch-size 25` chỉ quy định số family xử lý mỗi lần lưu checkpoint. Khi dùng `--media`, importer lấy tất cả URL ảnh khác nhau của product family, tối đa 100 ảnh theo giới hạn listing của database; dùng `--media-limit N` nếu muốn giới hạn. Report phân biệt `sourceImages` với `importedImages` để không nhầm số ảnh phát hiện với số ảnh đã lưu. Chạy lại cùng lệnh sẽ tiếp tục các family chưa hoàn tất; `--fresh` chạy lại từ đầu. Checkpoint và report ở `artifacts/`.

Trên gói Supabase Free, importer làm sạch metadata riêng tư, tối ưu ảnh thông thường sang AVIF với chiều rộng tối đa 600 px, mục tiêu 16 KB/ảnh (`TAASS_MEDIA_TARGET_BYTES`). Ảnh có dấu hiệu C2PA/JUMBF được giữ nguyên. Tiến trình dừng an toàn nếu số byte ảnh mới của lần chạy đạt `TAASS_MEDIA_BUDGET_BYTES` (mặc định 700 MiB), nhằm để lại khoảng trống cho dữ liệu Storage đã có. Chỉ tăng ngân sách khi đã kiểm tra dung lượng thực tế trong Supabase.

Sau khi một lượt import trước đây chỉ lấy 1 ảnh, chạy bù ảnh cho các family đã có trong checkpoint; lệnh này chỉ cập nhật `media` và ảnh đại diện, không ghi lại giá hay variant:

```powershell
$env:TAASS_MEDIA_BACKFILL_SKUS_FILE = 'artifacts/taass-metadata-checkpoint.json'
npm run sync:taass -- --all --media --media-backfill-only
```

Nếu đã nhập sản phẩm trước khi bật phân loại collection, chạy backfill an toàn, có thể chạy lại mà không tạo liên kết trùng:

```powershell
npm run route:taass -- --dry-run
npm run route:taass -- --write
```

Importer bỏ qua Live Break vì đó là dịch vụ theo sự kiện; thêm `--include-live-breaks` nếu cần nhập cả loại này. Khi một trang variant lỗi, cả family được giữ lại trong danh sách chưa hoàn tất để lần chạy sau thử lại, tránh lưu thiếu size.

## Ưu tiên toàn bộ sản phẩm mũ

Lọc các URL mũ/cap/beanie/knit hat trong sitemap, xác nhận loại sản phẩm sau khi đọc trang, lấy đủ ảnh và chỉ xuất bản khi listing qua cổng nội dung, ảnh, variant và rà soát nhãn hiệu:

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
npm run sync:taass -- --all --headwear-only --publish-headwear --media --batch-size 10
```

Listing mũ đủ điều kiện được `PUBLISHED` với SEO `INDEXABLE`, variant `ACTIVE`. Trường hợp có nhãn hiệu lớn như adidas/Nike mà chưa được duyệt quyền nằm trong `headwearNeedsReview` và ở `DRAFT`. Chỉ sau khi chủ shop xác nhận rõ quyền bán và dùng tên/ảnh, thêm `--approve-headwear-rights`; importer ghi quyết định và thời điểm duyệt vào `ai_metadata.catalogReview`. Sau khi nhóm mũ được nhập, cần build/deploy lại để các trang SEO HTML tĩnh mới và sitemap khớp với trạng thái database.

## Phần catalog ngoài mũ và jersey

Luồng `--remaining-only` loại các URL ứng viên mũ/jersey trước khi crawl, rồi kiểm tra loại hàng sau khi đọc trang. Nó dùng checkpoint riêng, giữ listing `DRAFT`, variant `ACTIVE`, tồn kho 1000/variant và giá EUR→USD 1:1. Ví dụ chạy với ngân sách ảnh 350 MiB cho tiến trình này:

```powershell
$env:TAASS_SOURCE_AUTHORIZED = 'true'
$env:TAASS_MEDIA_BUDGET_BYTES = '367001600'
npm run sync:taass -- --all --remaining-only --media --batch-size 25
```

Do URL nguồn có thể chứa chữ “hat” hoặc “jersey” dù sản phẩm thực là loại khác, sau khi ba scope hoàn tất phải đối chiếu toàn bộ 11.298 family trong sitemap với `pod_catalog_imports` và nhập bù các family chưa có audit. Không xem tổng checkpoint theo scope là bằng chứng rằng catalog đã đủ.

## Tồn kho và giá

`TAASS_DEFAULT_INVENTORY=1000` áp dụng cho **từng variant**, không phải tổng của listing. Có thể đổi giá trị qua biến môi trường nếu cần.

Giá nguồn của TAASS là EUR trong khi storefront dùng USD. Importer giữ nguyên con số theo tỉ lệ **1 EUR = 1 USD**; ví dụ 79,95 EUR thành 79,95 USD, không dùng tỷ giá. Listing `DRAFT` chưa hiển thị trên storefront dù variant `ACTIVE`.

## Trạng thái hoàn tất 24/09/2026

- Audit live `artifacts/taass-coverage-report.json`: 11.293/11.293 family hiện còn trong sitemap đã có bản ghi import, thiếu 0. Supabase có 11.314 bản ghi TAASS, gồm 21 mã đã rời sitemap sau khi nhập.
- Các report import đã được đối chiếu từng listing với Supabase bằng `scripts/verify-taass-report.mjs`: tổng 49.410 ảnh, variant `ACTIVE` tồn kho 1.000, giá EUR→USD 1:1, category và liên kết collection; không phát hiện sai lệch.
- 3.379 listing mũ đã `PUBLISHED/INDEXABLE`; các listing khác giữ `DRAFT`. Bộ lọc mũ nhận diện thêm `skully` và không xem móc khóa có chữ “cap” là mũ.
- Production deployment `dpl_5D1hD94gCbfxRkPdvuoTVf4kzMdi` đã tạo 3.410 trang sản phẩm indexable. Mẫu mũ mới SKU 721480 có canonical, `index,follow`, xuất hiện trong sitemap và đủ 4 ảnh công khai. Toàn bộ 219 test đã qua.
- Checkpoint remaining cũ vẫn ghi 18 family lỗi vì sitemap TAASS thay đổi từ 6.765 sang 6.759 family trong khi job chạy; không sửa lại checkpoint lịch sử. Cả 18 family đã được nhập và xác minh bằng checkpoint riêng `artifacts/taass-remaining-retry-final-checkpoint.json`. Các family mới khác được nhập qua các checkpoint `taass-reconcile-*-20260924`. Audit live ở trên là bằng chứng phủ catalog hiện tại; không dùng cờ `complete` của checkpoint lịch sử để kết luận thiếu sản phẩm.

Để đồng bộ một đợt sản phẩm mới, chạy `npm run audit:taass` trước và chỉ nhập các `familyCode` mới bằng `--family-codes` với checkpoint riêng, sau đó audit lại. Không chạy lại checkpoint remaining lịch sử với `--resume-any` khi sitemap đã thay đổi.

## Personalization TAASS

`scripts/enable-taass-customization.mjs --write` bật cùng một schema customer-request cho mọi listing TAASS: `name`, `number` và `teamLogo`. Tên và số là tùy chọn; logo là upload riêng tư, yêu cầu khách xác nhận quyền sử dụng. Vì phần lớn catalog không có vùng in được designer duyệt, trường logo dùng `studioReviewRequired`; khách gửi yêu cầu để studio xác nhận vị trí/khả năng sản xuất, hệ thống không tự ghép logo lên ảnh sản phẩm. Listing được đặt `type=PERSONALIZED`, thêm copy hướng dẫn và tag `customizable`, trong khi `status`/SEO giữ nguyên.

Luồng logo exact/AI chỉ bật sau khi admin vẽ `previewRegion` cụ thể cho một listing. Không nên tự gán một vùng logo mặc định cho mũ, thẻ, vật lưu niệm hoặc live break.

Migration `202609280001_allow_logo_custom_field.sql` keeps the admin listing RPC compatible with the `logo` field type when migrations are applied to a new environment.
