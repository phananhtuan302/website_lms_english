# Bảng yêu cầu nghiệp vụ - Hệ thống kiểm tra và ôn tập Tiếng Anh (Chị Hiền)

> Nguồn: `Bảng yêu cầu nghiệp vụ - Chị Hiền.xlsx` (trích xuất nguyên văn, không diễn giải thêm ở file này — diễn giải/kế hoạch nằm ở `PROJECT_PLAN.md` và `BACKLOG.md`)

Màu sắc chủ đạo: đỏ cam pastel kèm trắng, đen.

## Bảng yêu cầu chi tiết

| STT | Nhóm chức năng | Yêu cầu nghiệp vụ | Mô tả yêu cầu thu thập từ khách hàng | Đối tượng sử dụng | Ghi chú |
|---|---|---|---|---|---|
| 1 | Ngôn ngữ hệ thống | Giao diện website bằng tiếng Anh | Toàn bộ giao diện và nội dung chức năng chính của website sử dụng tiếng Anh. | Giáo viên, Học sinh | |
| 2 | Quản lý tài khoản | Học sinh có tài khoản riêng | Mỗi học sinh có tài khoản cá nhân để đăng nhập, làm bài, học từ vựng và theo dõi kết quả học tập. | Học sinh | |
| 3 | Quản lý bài kiểm tra | Giáo viên tạo bài test | Giáo viên có thể tạo và quản lý các bài kiểm tra trên hệ thống. | Giáo viên | |
| 4 | Làm bài kiểm tra | Học sinh quét QR để vào làm bài | Mỗi bài test có thể cung cấp mã QR để học sinh quét và truy cập vào bài kiểm tra. | Giáo viên, Học sinh | Cái này là trên lớp, GV cung cấp mã QR, còn tài khoản HS chỉ cần đăng nhập join làm thôi |
| 5 | Quản lý mã đề | Xáo trộn câu hỏi/đáp án để tạo mã đề khác nhau | Hệ thống có chức năng xáo trộn nội dung bài test nhằm tạo nhiều mã đề khác nhau cho học sinh. | Giáo viên | Có 2 mã đề chính, trong đó xáo trộn để tạo ra các mã đề khác nữa |
| 6 | Theo dõi làm bài | Theo dõi tiến độ làm bài theo thời gian thực | Giáo viên có thể theo dõi realtime từng học sinh đang làm đến đâu trong bài kiểm tra. | Giáo viên | |
| 7 | Theo dõi làm bài | Theo dõi phần trăm hoàn thành | Hiển thị tỷ lệ % bài kiểm tra mà từng học sinh đã hoàn thành trong thời gian làm bài. | Giáo viên | |
| 8 | Báo cáo bài kiểm tra | Theo dõi thời gian làm bài | Hệ thống ghi nhận thời gian làm bài của học sinh và cung cấp chỉ số thời gian làm bài trung bình. | Giáo viên | Có report điểm theo tháng, theo unit, theo quý, theo năm |
| 9 | Chấm điểm | Theo dõi câu trả lời đúng/sai | Giáo viên có thể xem kết quả học sinh trả lời đúng hoặc sai đối với các câu hỏi có đáp án xác định. | Giáo viên, Học sinh | |
| 10 | Writing | Ngăn học sinh copy-paste nội dung vào bài Writing | Đối với phần Writing, hệ thống cần hạn chế hoặc ngăn học sinh dán nội dung đã sao chép vào ô trả lời. | Học sinh | |
| 11 | Flashcard | Tạo và học Flashcard từ vựng | Hệ thống có chức năng flashcard phục vụ việc học và ôn tập từ vựng. | Giáo viên, Học sinh | Tạo các exercises để học từ vựng, đa dạng dạng bài: điền từ vào chỗ trống, unscramble, nghe từ → viết lại, xem phiên âm IPA → viết từ, matching (meaning-vocab, hình ảnh-vocab, từ đồng nghĩa, từ trái nghĩa), dùng từ viết câu... Ý tưởng thêm: game học vocab kiểu Quizlet (bắn tàu vũ trụ, mario,...) |
| 12 | Flashcard | Theo dõi quá trình học từ vựng của học sinh | Giáo viên có thể theo dõi hoạt động và tiến độ học từ vựng/flashcard của từng học sinh. | Giáo viên | Theo dõi tiến độ học flashcards, và theo dõi tiến độ làm exercise |
| 13 | Vocabulary | Bảng xếp hạng học từ vựng | Phần học Vocabulary có bảng xếp hạng học sinh dựa trên kết quả và/hoặc mức độ học tập. | Giáo viên, Học sinh | |
| 14 | Vocabulary | Báo cáo xếp hạng theo tháng | Có báo cáo hàng tháng để xác định học sinh có điểm cao và mức độ học tập tích cực nhất. | Giáo viên | |
| 15 | Vocabulary | Báo cáo xếp hạng theo năm | Có báo cáo hàng năm để xác định học sinh có điểm cao và mức độ học tập tích cực nhất. | Giáo viên | |
| 16 | Unit Test | Quản lý hệ thống các bài Unit Test | Hệ thống cho phép tổ chức và quản lý các bài kiểm tra theo từng Unit. | Giáo viên, Học sinh | |
| 17 | Unit Test | Báo cáo và bảng xếp hạng Unit Test | Kết quả Unit Test có báo cáo và bảng xếp hạng để so sánh kết quả giữa các học sinh. | Giáo viên, Học sinh | |
| 18 | Vocabulary Check | Bài kiểm tra từ vựng cũ trong 15 phút | Có chức năng Vocabulary Check, thời lượng khoảng 15 phút, dùng để kiểm tra lại các từ vựng học sinh đã học trước đó. | Giáo viên, Học sinh | |
| 19 | Listening | Giáo viên điều khiển phát audio trong bài Listening | Đối với các bài Listening, giáo viên là người điều khiển việc phát audio. Khi giáo viên nhấn Play, audio sẽ được phát trong bài test của học sinh; học sinh không được tự nhấn Play hoặc chủ động phát audio. | Giáo viên, Học sinh | Học sinh chỉ nghe audio khi giáo viên phát — áp dụng khi làm test trên lớp. Còn tự luyện tập tại nhà thì vẫn phải có chức năng ấn play audio ở nhà. |
| 20 | Ngăn thoát tab | Thông báo nếu có thao tác thoát tab | Áp dụng tất cả các bài test | | |

## Ghi chú bổ sung (ghi chép rời từ khách hàng)

- Muốn có thêm **Speaking**: học sinh trả lời câu hỏi trong thời gian cho phép, và có AI chấm điểm + nhận xét.
- Muốn thêm phần **Ngữ pháp (Grammar)**: có lý thuyết, có bài luyện tập, có game, có report.
- Tóm lại cấu trúc chức năng chia làm các tab sau (có thể thêm bớt sau):
  1. Tab Vocab
  2. Tab Grammar
  3. Tab Listening
  4. Tab Reading
  5. Tab Writing
  6. Tab Speaking
  7. Tab Test — chia nhỏ: Vocab check, Unit check, Listening test, Mock test
  8. Tab Báo cáo (Report) — theo từng bài, theo tuần, theo tháng, theo học kỳ, theo năm

## Chỉ đạo vận hành từ khách hàng (áp dụng cho toàn bộ quá trình build)

- Ngôn ngữ lập trình / công nghệ: tự do lựa chọn theo các công nghệ phổ biến hiện nay (Node, C#, React,...).
- Các phần cần tích hợp bên ngoài (ví dụ: mã QR, đăng ký API của bên thứ 3, v.v.) mà không thể tự hoàn tất (do cần tài khoản/API key của khách hàng): cứ build phần logic/giao diện đầy đủ, để placeholder/stub chỗ cần khách hàng cung cấp, rồi tiếp tục — không dừng lại chờ.
- Khách hàng sẽ **không** tham gia kiểm tra/góp ý cho tới khi dự án hoàn thành khoảng 90–95%. Trong giai đoạn này: không đặt câu hỏi ngược lại cho khách hàng; đội (Leader/BA/Dev/Test) tự thống nhất hướng giải quyết khi có vướng mắc.
