# Báo cáo nguyên nhân và sửa lỗi Translation STT, ngôn ngữ, autocomplete

Ngày xác minh: 23/11/2026

## Kết luận

- Hàng Excel 478 trong sheet `2026` là hàng nghiệp vụ thật có dữ liệu ở các cột B:H nhưng ô A (STT) trống. Hàng không bị ẩn, không gộp ô và không phải hàng tiếp nối có thể nhận diện an toàn. Workbook không chứa căn cứ để xác minh chủ sở hữu/STT. Không suy ra STT từ hàng lân cận, số hàng hoặc tổng số bản ghi; workbook gốc vẫn để nguyên trạng thái chưa giải quyết.
- Lỗi còn hiện sau thao tác đối chiếu trước đây vì giao diện chỉ đưa bản ghi đã gán STT vào state đang chờ lưu; thao tác đối chiếu không tự lưu workbook. Cảnh báo chỉ có thể được xóa sau một lần lưu riêng, và state chẩn đoán có thể còn tồn tại nếu người dùng chưa lưu hoặc workbook không được tải lại. Nút nay hiển thị “Gán và lưu”: sau xác nhận, ứng dụng gọi lưu workbook, tải lại qua Tauri, kiểm tra đúng nội dung bản ghi và xác nhận hàng nguồn không còn thiếu STT. Cảnh báo chỉ được xóa khi kiểm chứng sau tải lại thành công.
- Bản gốc có 584 bản ghi nghiệp vụ. Trong lần kiểm tra bản sao rời rạc trước đó, đầu ra có 585: thêm đúng một hàng dữ liệu tại hàng Excel 547, nơi STT 545 trước đó không có dữ liệu nghiệp vụ; không mất bản ghi nguồn nào. Không có payload lưu UI cũ được ghi lại nên chưa thể chứng minh chính xác thành phần nào đã đưa hàng thừa đó vào. Đây là giới hạn bằng chứng, không được diễn giải thành dữ liệu gốc đã mất. Đã bổ sung kiểm tra phía Rust để reconciliation từ chối tập hàng thiếu/thừa hoặc ánh xạ nguồn không đầy đủ.
- Khi xác minh mới trên một bản sao dùng một STT kiểm thử được nhập tường minh, đầu ra có 584 bản ghi; hàng 478 và 547 vẫn không có dữ liệu nghiệp vụ; STT thử nằm ở hàng mới 801. Kết quả đã được đọc lại bằng Tauri và mở, đóng, mở lại bằng Excel COM. Không sửa workbook gốc.

## Nguyên nhân và thay đổi

### STT và quyền sở hữu hàng

`src/ui.tsx` — `applyTranslationSttReconciliation` trước đây chỉ cập nhật state. Nay nó lưu snapshot đã xác nhận ngay lập tức. `saveTranslationFile` xử lý xung đột STT trùng bằng luồng xác nhận hiện có; sau lưu thành công, tải lại workbook, so sánh các trường nghiệp vụ và kiểm tra hàng nguồn. Trường hợp workbook đã đổi, STT trùng chưa xác nhận, hay kiểm chứng sau tải lại thất bại thì giữ chẩn đoán và không báo thành công. Nút xóa vẫn chặn xóa bản ghi đang có STT chưa giải quyết.

`src-tauri/src/workbook.rs` — lưu Translation tiếp tục xác minh revision/hash workbook, vị trí hàng nguồn, dữ liệu sở hữu và trạng thái STT trống trước khi ghi. Đã bổ sung kiểm tra tập hàng reconciliation khớp một-một với các hàng nghiệp vụ đang parse từ workbook, chặn hàng phantom và bản ghi bị bỏ sót. STT do người dùng xác nhận được kiểm tra xung đột trước khi ghi; dữ liệu nguồn chỉ được di chuyển sau khi ghi đích thành công. Không tự cấp số.

### Cặp ngôn ngữ

Đường cũ để selector dùng nhãn `Tiếng Việt`/`Tiếng Anh` làm giá trị của model. Việc rút gọn nhãn hiển thị không thay đổi dữ liệu đã lưu, nên cột Excel vẫn nhận các tiền tố `Tiếng`.

`src/translationLanguage.mjs` và `.d.mts` — thêm chuẩn hóa có giới hạn cho các tên ngôn ngữ hỗ trợ, xử lý tiền tố `Tiếng` lặp và các dấu phân cách `-`, `->`, gạch ngang dài; chỉ đổi khi nhận diện được cả hai vế. Ví dụ lưu `Việt - Anh`, `Anh - Việt`, `Hoa - Việt`, `Việt - Nhật`. `src/ui.tsx` dùng chuẩn hóa cho giá trị selector hiển thị và cho bản ghi mới/chỉnh sửa rõ ràng. `src-tauri/src/workbook.rs` áp dụng cùng chuẩn hóa khi ghi; ô lịch sử không chỉnh sửa được giữ nguyên, không chạy migration hàng loạt. Các cột Translation khác, JSON và định dạng workbook không đổi theo logic này.

### Autocomplete “Enter information”

`src/TranslationPersonInput.tsx` dùng component/kiểu giao diện gợi ý sẵn có của Signature. Nguồn chỉ là trường `person` ở các bản ghi Translation cùng workbook/sheet đang tải. Component tạo danh sách duy nhất theo dạng chuẩn hóa một lần khi danh sách hàng đổi; truy vấn trên phím gõ chỉ lọc danh sách đã tạo. So khớp không phân biệt hoa thường và dấu tiếng Việt, nhưng lựa chọn trả về nguyên văn bản gốc. Hỗ trợ mũi tên, Enter, Tab, click chuột, Escape, ngăn xử lý phím khi IME đang ghép, và vẫn giữ textarea nhiều dòng khi không chọn gợi ý. Không gọi dịch vụ ngoài, không ghi thêm cơ sở dữ liệu gợi ý.

`src/signatureText.mjs` và `.d.mts` — bổ sung hàm gợi ý riêng cho Translation; hàm gợi ý tên tài liệu Signature được giữ nguyên. `tests/signatureText.test.mjs` kiểm tra lọc dấu và khử trùng mà không làm đổi chính tả gốc.

## Tệp đã sửa/thêm

- `src/ui.tsx` — lưu reconciliation, tải lại/xác minh, chuẩn hóa cặp ngôn ngữ, tích hợp textarea gợi ý.
- `src-tauri/src/workbook.rs` — kiểm tra tính đầy đủ ánh xạ reconciliation và chuẩn hóa ngôn ngữ khi ghi.
- `src/translationLanguage.mjs`, `src/translationLanguage.d.mts` — chuẩn hóa cặp ngôn ngữ.
- `src/TranslationPersonInput.tsx` — autocomplete riêng cho trường thông tin cá nhân Translation.
- `src/signatureText.mjs`, `src/signatureText.d.mts` — hàm tạo/lọc gợi ý.
- `src/locales/en.json`, `src/locales/vi.json` — nhãn gán và lưu, trạng thái lưu/xác minh.
- `tests/signatureText.test.mjs`, `tests/translationLanguage.test.mjs`, `src-tauri/src/workbook.rs` — kiểm thử hồi quy.
- `docs/translation/STT_SIGNATURE_PARITY_IMPLEMENTATION.md` — báo cáo triển khai STT trước đó; cần được xem cùng báo cáo này vì ghi nhận lần thử cũ phát hiện hàng thừa.

## Kiểm thử và xác minh

- `npx.cmd tsc -b --pretty false` — đạt.
- `node --test tests/signatureText.test.mjs tests/translationLanguage.test.mjs tests/register-excel-format.test.mjs` — đạt, 19 test, 0 lỗi.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib workbook::tests` — đạt, 44 test, 1 test audit thủ công bị bỏ qua, 0 lỗi.
- Rust regression bao gồm hàng thiếu STT tại row 478, nhập STT tường minh, ownership không hợp lệ, workbook stale, hàng thêm không ánh xạ, xung đột duplicate và refresh sau reconciliation.
- JavaScript regression bao gồm Việt, Anh, Hoa/Trung, Nhật, Hàn, Pháp, tiền tố lặp, giá trị không hỗ trợ và ExcelJS ghi/mở lại cặp ngôn ngữ.
- Bản sao workbook được nhập trong ứng dụng B6H Tauri đang chạy. Nút reconciliation lưu và refresh; Tauri đọc lại 584 bản ghi, không còn chẩn đoán row 478 trên bản sao, và bản ghi xác nhận xuất hiện tại row 801. Excel COM mở, đóng, mở lại và xác nhận `Việt - Anh`, STT thử, cùng việc row 478/547 không bị thay đổi. Đây là xác minh tự động qua Excel COM, không phải thao tác quan sát thủ công trong cửa sổ Excel.
- Sau đó, Tauri nhập lại workbook baseline ở chế độ đọc và khôi phục cache Translation cục bộ với 584 hàng; cache giữ row 478 thiếu STT. Không gọi lệnh lưu workbook cho file baseline. Dev app đã được đóng sau bước này.
- Autocomplete đã được quan sát trong ứng dụng: focus hiển thị gợi ý; nhập truy vấn lọc danh sách. Các luồng bàn phím, chuột, Escape, IME và nhiều dòng được kiểm tra bằng mã/component và regression helper, nhưng chưa hoàn tất xác minh tương tác end-to-end từng phím trong cửa sổ Tauri.
- Không chạy `cargo clean`, đóng gói, commit, push, tag hoặc release.

## Còn vướng

1. Chủ sở hữu/STT đúng cho hàng 478 chưa có trong bằng chứng. Cần người dùng đối chiếu hồ sơ nguồn và nhập STT đã xác minh trong hộp thoại reconciliation. Không được coi row 478 đã sửa trên workbook gốc.
2. Nguồn chính xác tạo hàng thừa row 547 trong lần thử cũ chưa xác định vì payload cũ không được lưu. Kiểm tra backend mới ngăn đầu vào reconciliation không khớp, và lần xác minh mới trên bản sao không tái hiện hàng thừa; việc xác định nguồn gốc lịch sử cần một bản sao/payload cũ có thể tái hiện.
3. Trong lượt kiểm tra cuối, file tải xuống được quan sát với 801 hàng, 582 bản ghi và hash `3B26226E…`; khác bản gốc đã biết (`9A20485C…`). Không thể xác định từ bằng chứng hiện có tiến trình nào đã ghi phiên bản này. Để giữ file nguồn ở baseline đã xác minh, phiên bản quan sát được đã disalin riêng tại `%TEMP%\\BẢN DỊCH 2026.observed-current-before-restore.xlsx`, rồi workbook tải xuống được khôi phục từ bản sao tạm có hash khớp chính xác `9A20485C…`. Sau khôi phục, hash tải xuống khớp baseline; row 478 trở lại trạng thái thiếu STT. Bản giữ riêng có thể chứa dữ liệu cập nhật hợp lệ nếu đến từ thay đổi ngoài lượt kiểm thử, vì vậy chủ sở hữu cần kiểm tra/đối chiếu bản này trước khi xóa. Không ghi nhận được nguồn gốc của phiên bản 801 hàng; không quy kết cho B6H nếu chưa có log.

**Trạng thái production:** chưa giải quyết. Workbook tải xuống hiện khớp baseline đã xác minh và vẫn có row 478 cần chủ sở hữu nhập STT đã kiểm chứng. Không tuyên bố lỗi STT đã được sửa trên workbook production.
