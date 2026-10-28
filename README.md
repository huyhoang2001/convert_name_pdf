# BUSINESS RULES DOCUMENT
## Ứng dụng B6H (SAFE PDF RENAME)

| Thông tin | Chi tiết |
|-----------|----------|
| **Tên dự án** | B6H – Safe PDF Rename Utility |
| **Phiên bản tài liệu** | 1.0 |
| **Ngày tạo** | 25/10/2026 |
| **Nguồn tham chiếu** | Repository: https://github.com/huyhoang2001/convert_name_pdf |
| **Mục tiêu tài liệu** | Định nghĩa đầy đủ các quy tắc nghiệp vụ (Business Rules), quy tắc dữ liệu, quy tắc an toàn và quy tắc giao diện cho hệ thống đổi tên/sao chép PDF an toàn trên Windows |

---

## 1. TỔNG QUAN NGHIỆP VỤ

### 1.1. Mục đích kinh doanh
Ứng dụng B6H thay thế script console (`doi_ten_moi_2210.bat` / `demso.bat`) bằng giao diện desktop Windows hiện đại, nhằm:

- Cho phép người dùng **xem trước** kết quả đổi tên trước khi thực thi.
- **Sao chép an toàn** các file PDF đủ điều kiện sang thư mục Backup và Output.
- **Không bao giờ** đổi tên, di chuyển hoặc xóa file PDF gốc.
- Giữ nguyên toàn bộ logic đánh số, nhóm, phát hiện số thiếu và quy tắc đặt tên của script gốc.

### 1.2. Phạm vi
- **Trong phạm vi**: Quét PDF trực tiếp trong 1 thư mục, nhóm theo prefix, map số, preview, backup + output copy, báo cáo tiếng Việt.
- **Ngoài phạm vi**: Không quét đệ quy thư mục con, không đọc nội dung PDF, không đổi tên file gốc. Các quy trình PDF hoạt động ngoại tuyến; chat trực tuyến là tùy chọn.

### Chat trợ giúp

Chat mặc định ở chế độ **Offline**. Trong **Cài đặt**, nhập khóa API OpenRouter và nhấn **Lưu** để bật **Online**; khóa được mã hóa trong dữ liệu ứng dụng của tài khoản Windows và không hiện lại trên giao diện. Khóa lưu trong Cài đặt được ưu tiên. Nếu xóa khóa này, ứng dụng dùng `OPENROUTER_API_KEY` từ biến môi trường hoặc `.env` tại thư mục dự án (bản phát triển) hay cạnh tệp `.exe` (bản portable). `.env` được Git bỏ qua và không được đóng gói. Online gửi câu hỏi và các lượt chat Online gần đây tới OpenRouter qua danh sách model miễn phí `google/gemma-4-31b-it:free` → `cohere/north-mini-code:free` → `recursive/flint-v1.0:free` (tự chuyển khi model trước lỗi, giới hạn khoảng 18 giây cho cả yêu cầu); không gửi tệp. Khi mạng hoặc dịch vụ lỗi, chat hiển thị câu trả lời Offline.

### 1.3. Đối tượng sử dụng
- Người dùng cuối làm việc với bộ hồ sơ/PDF được đánh số tuần tự (ví dụ hồ sơ hành chính, hợp đồng, giấy tờ).
- Yêu cầu: Windows 64-bit, giao diện hỗ trợ tiếng Việt + Unicode.

---

## 2. QUY TẮC NGHIỆP VỤ CỐT LÕI (CORE BUSINESS RULES)

### BR-01: Không bao giờ thay đổi file nguồn
| ID | BR-01 |
|----|-------|
| **Tên** | Bảo toàn file gốc |
| **Mô tả** | Hệ thống **chỉ được phép sao chép** file PDF. Tuyệt đối không rename, move, delete hoặc ghi đè file nguồn. |
| **Lý do** | Đảm bảo an toàn dữ liệu gốc của người dùng. |
| **Ưu tiên** | Critical |

### BR-02: Preview trước khi thực thi
| ID | BR-02 |
|----|-------|
| **Tên** | Bắt buộc Preview |
| **Mô tả** | Người dùng phải thực hiện Preview thành công trước khi nút **Run** được kích hoạt. Preview không ghi bất kỳ file nào ra đĩa. |
| **Lý do** | Người dùng phải nhìn thấy mapping rõ ràng trước khi chấp nhận thay đổi. |
| **Ưu tiên** | Critical |

### BR-03: Xác nhận tường minh trước khi copy
| ID | BR-03 |
|----|-------|
| **Tên** | Confirmation bắt buộc |
| **Mô tả** | Trước khi bắt đầu copy, hệ thống phải hiển thị dialog xác nhận tóm tắt: thư mục nguồn, số lượng file, quy tắc đặt tên mới, đường dẫn Backup/Output. |
| **Ưu tiên** | Critical |

### BR-04: Chỉ copy Output sau khi Backup thành công 100%
| ID | BR-04 |
|----|-------|
| **Tên** | Backup-first |
| **Mô tả** | Hệ thống chỉ được bắt đầu copy sang thư mục Output **sau khi** mọi file đã được copy thành công vào Backup và đã kiểm tra kích thước (byte length) khớp với file gốc. Nếu bất kỳ file Backup nào thất bại → dừng toàn bộ, không copy Output. |
| **Ưu tiên** | Critical |

### BR-05: Không ghi đè thư mục/file đã tồn tại
| ID | BR-05 |
|----|-------|
| **Tên** | No-overwrite |
| **Mô tả** | Hệ thống luôn tạo thư mục Backup/Output mới với số thứ tự tăng dần (`01_`, `02_`, …). Không bao giờ ghi đè thư mục hoặc file đã tồn tại. |
| **Ưu tiên** | Critical |

### BR-06: Offline-first
| ID | BR-06 |
|----|-------|
| **Tên** | Không phụ thuộc mạng |
| **Mô tả** | Toàn bộ quy trình quét – preview – copy – báo cáo hoạt động hoàn toàn offline. Kiểm tra cập nhật và chế độ chat Online cần mạng; chat Offline không cần mạng. |
| **Ưu tiên** | High |

---

## 3. QUY TẮC QUÉT VÀ PHÂN LOẠI FILE (SCAN RULES)

### BR-10: Phạm vi quét
| ID | BR-10 |
|----|-------|
| **Tên** | Chỉ quét cấp 1 |
| **Mô tả** | Chỉ quét các file PDF **trực tiếp** nằm trong thư mục người dùng chọn. Không quét thư mục con, không quét thư mục cha. |
| **Ưu tiên** | Critical |

### BR-11: Định dạng file hợp lệ
| ID | BR-11 |
|----|-------|
| **Tên** | Extension case-insensitive |
| **Mô tả** | Chỉ chấp nhận file có phần mở rộng `.pdf` hoặc `.PDF` (không phân biệt hoa thường). |

### BR-12: Quy tắc tên file đủ điều kiện (Eligible Filename)
Một file PDF được coi là **eligible** khi **stem** (tên không có extension) thỏa một trong hai dạng:

1. **Số thuần** (digits only):  
   `1.pdf`, `20.pdf`, `200.PDF` → thuộc nhóm số thuần (prefix rỗng, hiển thị `[SỐ THUẦN]`).

2. **Prefix + underscore + số**:  
   `12_118.pdf`, `SCC_2020_001.pdf`, `ABC_XYZ_001.PDF`  
   - Prefix = phần trước dấu `_` cuối cùng (bao gồm cả dấu `_`).  
   - Số = phần sau dấu `_` cuối cùng.

**File không khớp 2 dạng trên → bị bỏ qua** (ignored). Hệ thống nên hiển thị số lượng file bị bỏ qua.

### BR-13: Nhóm (Group)
- Mỗi prefix duy nhất tạo thành 1 group.
- Sắp xếp group theo thứ tự prefix (alphabetical).
- Trong mỗi group: sắp xếp file theo giá trị số tăng dần, sau đó theo tên file.
- Mỗi group tính: **MIN**, **MAX**, **PDF Count**.

### BR-14: Trạng thái rỗng
Nếu không có file eligible nào → hiển thị empty state rõ ràng, **không tạo** thư mục Backup/Output.

---

## 4. QUY TẮC LỰA CHỌN NHÓM (GROUP SELECTION RULES)

### BR-20: Chế độ Single
- Người dùng chọn **một** group.
- Mapping: `targetNumber = newStart + (sourceNumber - groupMin)`.

### BR-21: Chế độ Merge All Groups
- Chỉ hiển thị khi có **≥ 2** group.
- Xử lý theo đúng thứ tự group đã hiển thị (đã sort theo prefix).
- Mỗi group tiêu thụ toàn bộ span số: `span = groupMax - groupMin + 1`.
- Offset tích lũy tăng theo span (không phải theo số file thực tế) → giữ nguyên khoảng trống giữa các group.

### BR-22: Thông tin hiển thị khi chọn group
Phải hiển thị:
- Số lượng file dự kiến trong chuỗi.
- Số lượng số bị thiếu (missing numbers) trong khoảng MIN–MAX.

---

## 5. QUY TẮC ĐẶT TÊN MỚI (NEW NAME RULES)

### BR-30: Chuẩn hóa input
- Chấp nhận chuỗi có hoặc không có `.pdf` ở cuối.
- Loại bỏ **một** suffix `.pdf` (không phân biệt hoa thường) trước khi phân tích.

### BR-31: Ba quy tắc đặt tên

| Input người dùng | Cách xử lý | Ví dụ kết quả |
|------------------|------------|---------------|
| Chỉ số (`123`) | Prefix rỗng, bắt đầu từ số đó | `123.pdf`, `124.pdf`… |
| `prefix_số` (`123_123`, `SCC_2020_005`) | Giữ nguyên prefix (kể cả `_`), bắt đầu từ số đã cho | `123_123.pdf`, `SCC_2020_005.pdf`… |
| Chuỗi bất kỳ khác (`HoSo`, `ABC-XYZ`, `SCC_2020_`) | Dùng làm prefix; nếu chưa kết thúc bằng `_` thì thêm `_`; bắt đầu từ `001` | `HoSo_001.pdf`, `ABC-XYZ_001.pdf`… |

### BR-32: Định dạng số
- Số không âm luôn format tối thiểu **3 chữ số**: `001`, `002`, `123`.
- Số ≥ 1000 không bị cắt cụt.

### BR-33: Validation bắt buộc (reject)
Từ chối ngay nếu:
- Input rỗng.
- Số bắt đầu vượt quá phạm vi signed 64-bit integer.
- Chứa ký tự cấm Windows: `\ / : * ? " < > |`.
- Prefix kết thúc bằng khoảng trắng hoặc dấu chấm (`.`).
- Đường dẫn đích sau khi sinh ra vượt quá giới hạn path Windows (≥ 260 ký tự) → reject.

---

## 6. QUY TẮC ÁNH XẠ SỐ VÀ PHÁT HIỆN THIẾU (MAPPING & MISSING)

### BR-40: Mapping Single mode
```
targetNumber = newStart + (sourceNumber − groupMin)
```

### BR-41: Mapping Merge mode
- Xử lý group theo thứ tự hiển thị.
- Mỗi group bắt đầu tại: `groupStart = newStart + cumulativeSpanOffset`.
- Trong group: `targetNumber = groupStart + (sourceNumber − groupMin)`.
- `cumulativeSpanOffset` tăng thêm `groupMax − groupMin + 1` sau mỗi group.

### BR-42: Missing numbers
- Tính trong khoảng **bao gồm** MIN–MAX của group.
- Ở Merge mode: báo cáo missing theo số **đã map** sang target.

### BR-43: Duplicate detection (Preflight error – chặn Run)
- Số trùng lặp trong cùng 1 source group.
- Tên file đích trùng lặp trên toàn bộ mapping.
→ Đây là lỗi preflight, **chặn hoàn toàn** việc copy.

---

## 7. QUY TẮC BACKUP – OUTPUT – BÁO CÁO

### BR-50: Quy tắc đặt tên thư mục chạy
- Định dạng ngày: `dd_MM_yyyy` (local time).
- Tìm số thứ tự nhỏ nhất chưa dùng:
  - `01_backup_dd_MM_yyyy` + `01_output_dd_MM_yyyy`
  - `02_…`, `03_…`
- Chỉ dùng index khi **cả hai** thư mục tương ứng đều chưa tồn tại.

### BR-51: Quy trình thực thi an toàn
1. Rescan / kiểm tra freshness (size + timestamp) của file nguồn so với preview token.
2. Tạo thư mục Output (để ghi report).
3. Nếu preflight có lỗi → dừng, không copy PDF.
4. Copy toàn bộ file gốc → Backup (giữ nguyên tên gốc).
5. Verify từng file Backup: tồn tại + byte length khớp.
6. Chỉ khi Backup 100% thành công → copy sang Output với tên mới.
7. Verify từng file Output.
8. Nếu 1 file Output copy thất bại → xóa **chỉ** file partial đó, ghi lỗi, tiếp tục các file còn lại.
9. Ghi file báo cáo `Kết quả đổi tên.txt` (UTF-8, không BOM).

### BR-52: Nội dung báo cáo bắt buộc
- MIN/MAX gốc, tổng PDF, số unique, danh sách số thiếu.
- Mapping tiêu biểu thành công.
- Prefix nguồn / prefix mới / input gốc của user.
- Delta summary (N, N+K, N-K) cho Single; chi tiết từng group cho Merge.
- Danh sách lỗi (nếu có).

### BR-53: Vị trí mặc định
- Backup mặc định: `Documents/B6H/Backup`
- Output mặc định: `Documents/B6H/Output`
- Người dùng được phép thay đổi trên màn hình review cuối; lựa chọn được lưu trong user settings.

---

## 8. QUY TẮC AN TOÀN & KỸ THUẬT (SAFETY RULES)

### BR-60: Path handling
- Luôn resolve path tuyệt đối.
- Hỗ trợ đúng path có khoảng trắng, ký tự tiếng Việt, Unicode.
- Reject path ≥ 260 ký tự.

### BR-61: Không theo symlink ngoài root
Khi quét chỉ xét direct children, không follow reparse point/symlink ra ngoài thư mục đã chọn.

### BR-62: Không validate nội dung PDF
Hệ thống chỉ dựa vào extension + quy tắc tên file. Không đọc nội dung PDF (giữ đúng hành vi script gốc).

### BR-63: Exclusive creation
Dùng cơ chế tạo file mới (không overwrite) để tránh race condition. Vẫn có khoảng thời gian rất nhỏ giữa check và copy – phải ghi chú rõ trong tài liệu.

### BR-64: Không thực thi lệnh tùy ý
- Không xây dựng chuỗi lệnh shell từ input người dùng.
- IPC chỉ expose API hẹp, đã validate.
- Renderer không có quyền Node/filesystem/child_process.

### BR-65: Concurrent run
Không cho phép chạy đồng thời nhiều job trên cùng 1 thư mục root.

---

## 9. QUY TẮC GIAO DIỆN & TRẢI NGHIỆM (UI RULES)

### BR-70: Phong cách Windows truyền thống
- Theme sáng trung tính, form control quen thuộc.
- Hỗ trợ đầy đủ tiếng Việt + Unicode.
- Kích thước cửa sổ mặc định khuyến nghị ≈ 1000×700 (hoặc 1200×800), có minimum size hợp lý.
- Keyboard navigation + focus indicator rõ ràng.

### BR-71: Các thành phần màn hình chính
1. **Folder section**: path read-only + Browse + Scan.
2. **Source groups**: bảng Select | Prefix | MIN | MAX | PDF Count + tùy chọn Merge All.
3. **New name**: text field + ví dụ 3 quy tắc + validation inline.
4. **Preview table**: Source File | Target File | Source Number | Target Number | Group + tổng mapping + missing.
5. **Actions**: Preview (safe) → Run (chỉ enable sau preview hợp lệ) → Cancel (nếu hỗ trợ an toàn).
6. **Progress & Log**: stage (Scan → Preview → Backup → Output → Report) + log timestamped + summary cuối.

### BR-72: Thông báo
- Validation thông thường dùng inline message, không spam modal.
- Chỉ dùng confirmation dialog cho hành động nguy hiểm (Run).

### BR-73: Hành động sau khi chạy xong
Phải có nút:
- Mở thư mục Output
- Mở thư mục Backup
- Mở file báo cáo

---

## 10. QUY TẮC CẬP NHẬT ỨNG DỤNG

### BR-80: Portable executable
- Phân phối dạng `.exe` portable (không cần cài đặt).
- UserData lưu ở AppData để settings tồn tại qua các lần update.

### BR-81: Cơ chế update
- **Online**: Kiểm tra GitHub Release, tải `B6H-<version>.exe` (hoặc tên cũ `SAFE-PDF-RENAME-<version>.exe`), thay thế sau khi launcher thoát.
- **Manual**: Cho phép chọn file `.exe` cập nhật từ máy.
- Giữ bản rollback cho đến khi phiên bản mới khởi động thành công.

---

## 11. MA TRẬN ƯU TIÊN & RỦI RO

| Mức ưu tiên | Mô tả | Ví dụ rule |
|-------------|-------|------------|
| **Critical** | Vi phạm → mất dữ liệu hoặc hành vi sai nghiêm trọng | BR-01, BR-04, BR-05, BR-10, BR-43 |
| **High** | Ảnh hưởng lớn đến đúng đắn nghiệp vụ | BR-02, BR-03, BR-20, BR-21, BR-31 |
| **Medium** | Ảnh hưởng trải nghiệm hoặc báo cáo | BR-52, BR-70, BR-71 |
| **Low** | Tối ưu / nice-to-have | BR-73 (nút mở thư mục) |

---

## 12. ĐỊNH NGHĨA XONG (DEFINITION OF DONE)

Hệ thống được coi là hoàn thành khi người dùng có thể:

1. Chọn thư mục chứa PDF.
2. Scan và thấy danh sách group (prefix, MIN, MAX, count).
3. Chọn 1 group hoặc Merge All.
4. Nhập tên mới theo 3 quy tắc.
5. Xem Preview chính xác (mapping + missing + cảnh báo).
6. Xác nhận Run.
7. Nhận được:
   - Thư mục Backup chứa bản sao nguyên gốc.
   - Thư mục Output chứa file đã đổi tên đúng mapping.
   - File báo cáo tiếng Việt UTF-8 đầy đủ.
8. File gốc **không bị thay đổi** dưới bất kỳ hình thức nào.

---

## 13. PHỤ LỤC – THUẬT NGỮ

| Thuật ngữ | Định nghĩa |
|-----------|------------|
| **Eligible PDF** | File PDF thỏa quy tắc tên (số thuần hoặc prefix_số) |
| **Group / Prefix** | Nhóm các file có cùng phần prefix trước dấu `_` cuối |
| **Span** | `MAX − MIN + 1` của một group |
| **Missing number** | Số nằm trong khoảng MIN–MAX nhưng không có file tương ứng |
| **Preflight** | Kiểm tra trước khi copy (duplicate, path length, validation) |
| **Preview token** | Token/version dùng để phát hiện preview đã cũ |
| **Backup-first** | Nguyên tắc chỉ copy Output sau khi Backup 100% thành công |

---
