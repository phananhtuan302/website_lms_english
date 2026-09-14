# Quyết định công nghệ (Leader)

Quyết định một lần, áp dụng xuyên suốt dự án — Dev không tự đổi stack giữa chừng trừ khi Leader cập nhật file này.

## Kiến trúc

Monorepo (npm workspaces):

```
/client   - React 18 + TypeScript + Vite + Tailwind CSS
/server   - Node.js + TypeScript + Express + Socket.IO
/shared   - Types & constants dùng chung giữa client/server
/docs     - Tài liệu dự án (kế hoạch, backlog, tiến độ, tích hợp)
```

## Chi tiết lựa chọn

- **Frontend**: React + TypeScript + Vite, Tailwind CSS (theme màu đỏ cam pastel / trắng / đen theo yêu cầu). React Router cho điều hướng. Recharts cho biểu đồ báo cáo.
- **Backend**: Node.js + Express + TypeScript. REST API cho CRUD, Socket.IO cho các tính năng realtime (theo dõi tiến độ làm bài trực tiếp, giáo viên điều khiển phát audio Listening đồng bộ tới học sinh).
- **Database**: PostgreSQL + Prisma ORM (phù hợp cho các báo cáo tổng hợp theo tuần/tháng/quý/học kỳ/năm).
- **Auth**: JWT + bcrypt, phân quyền theo role (`teacher`, `student`).
- **Mã QR**: sinh QR hoàn toàn nội bộ bằng thư viện `qrcode` (npm) — mã hoá token/URL join bài test. Không cần API bên thứ 3, không cần stub.
- **Chấm Speaking bằng AI**: thiết kế qua interface `AIGradingProvider` (giao diện trừu tượng). Ghi âm + nhận diện giọng nói phía client dùng Web Speech API (miễn phí, không cần key) để tạo transcript nháp; gửi transcript + audio lên server. Bản dựng ban đầu dùng `MockAIGradingProvider` (heuristic đơn giản, không cần key) để toàn bộ luồng chạy được end-to-end; khi khách hàng cung cấp API key (vd. Anthropic) sẽ thay bằng provider thật — không phải sửa lại luồng nghiệp vụ, chỉ đổi provider. Ghi vào `INTEGRATIONS_TODO.md`.
- **Chống copy-paste (Writing)** và **chống thoát tab**: xử lý phía client bằng DOM events (`paste`, `visibilitychange`, `blur`) — không cần dịch vụ ngoài.
- **Game học từ vựng**: mini-game dựng bằng React + Canvas/DOM, tự viết trong nội bộ dự án — không cần thư viện game engine ngoài cho MVP.
- **Testing**: Vitest cho unit test, Playwright cho test luồng chính (đăng nhập, tạo bài test, làm bài, báo cáo).
- **Triển khai (deploy)**: chưa có yêu cầu/hạ tầng cụ thể từ khách hàng → chạy local dev trong giai đoạn build; việc chọn hosting/domain/CI-CD để sau, ghi vào `INTEGRATIONS_TODO.md`.

## Nguyên tắc cho các phần cần tích hợp bên ngoài

Bất kỳ tính năng nào cần credential/API key/tài khoản của khách hàng mới hoàn tất được (vd. nhà cung cấp AI chấm điểm thật, dịch vụ gửi email, hosting, domain, thanh toán nếu có sau này):
1. Vẫn build đầy đủ logic nghiệp vụ + giao diện + luồng dữ liệu.
2. Dùng provider/adapter giả lập (mock/stub) để chạy được end-to-end trong môi trường dev.
3. Ghi rõ trong `docs/INTEGRATIONS_TODO.md`: tên tích hợp, vị trí trong code (file/module), thông tin cần khách hàng cung cấp, cách thay thế khi có.
4. Không dừng tiến độ để chờ — tiếp tục các hạng mục khác.
