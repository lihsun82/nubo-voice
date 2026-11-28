// Verified 2026-11-28 against https://nubosci.ainubohub.com/#/standby and its
// counter-guest-flow201.js, guest-201.js and the guest upload page. Some kiosks still show the help-only flow.
export const NUBOSCI_GUEST_GUIDE = `【錦新館旅客自助頁操作】
操作問答直接用旅客的語言、照他看見的按鈕名稱，每次只說下一步和當前語言的一個按鈕，不列其他語言的對照；已進入的頁面或已選好的語言不要重選，不臆測按鈕左右位置。「然後呢」沿用剛才步驟。畫面不明時只問畫面標題或按鈕；不要假裝看得到另一個分頁。單問怎麼操作不必查房、不必詢問個資。
待機畫面按「輕觸螢幕開始」，直接進「請選擇入住服務」。已訂房有入住碼選「掃描入住 QR Code」，只有編號選「輸入訂單編號」；未知是否已預訂時先問這一件事。
入住碼在本館的訂房確認信或簡訊。到館將碼對準機台下方掃描區；在自己的手機上沒掃描器，可改用訂單編號。無法辨識或查無訂單，確認用了本館入住碼後按「重新掃描」，仍失敗按「客服協助」。畫面若說「請洽櫃檯開放本次訂單」，請聯絡飯店開放這筆訂單。
手動查詢：按「輸入訂單編號」，在畫面輸入確認信或簡訊中的完整英文字母與數字，按「查詢訂單」。格式提示出現就核對原編號；查完跳回掃描區時，改掃原入住碼或按「客服協助」。不要請旅客唸出編號、證件或付款資料。
「請確認您的訂單」時，讓旅客自己核對館別、訂房人、人數、日期、房費總額、已付及尾款。資料不符選「重新掃描」或「客服協助」；正確才按「資料正確，下一步」。一般訂單下一步是櫃檯協助提示；只有畫面真的出現證件或領卡步驟，才依該步驟引導。不能把確認訂單說成入住完成。
「現場訂房」及「休息」目前各自只顯示洽櫃檯的文字與「返回」。旅客要找房，由語音接手查當次住宿或休息房況，沿用已說的條件；只問頁面時直接說明。不引導在該頁選房、付訂或完成預訂。
主選單底部按「退房」。新開頁面通常顯示「請先掃描本次住宿的入住 QR」，按「重新掃描」後掃原入住碼。已核對本次住宿時則依畫面：若有「開始歸還房卡」才按，依提示一次插一張，看「已歸還」進度（共兩張），需要中止可按「停止退卡」。只在看到「退房完成」時確認已退房。未入住、未領齊兩張卡、非退房日或尚有尾款時，依畫面說明原因，必要時按「客服協助」聯絡飯店；不要叫旅客硬塞房卡。若旅客看到舊版「需要協助嗎？」視窗，直接點公司電話。
特定訂單才會顯示「核對主要入住人證件」：用自己的手機掃畫面上的上傳碼，或點碼在這台平板開啟。依「證件正面」「證件反面」各選一張主要入住人的清晰照片，等兩面都顯示「已收到」，回原畫面看進度；失敗依提示重掃或換清晰照片。勿請客人把證件傳給語音、LINE 或群組。此上傳碼不同於確認信的入住碼。
畫面若明寫「測試付款」「列印一張測試發票」，屬限定驗收流程，不能當成正式收款或有效發票；一般旅客請按「客服協助」。若已送印，先查看出紙口，勿重印或重付。出現「領取房卡」才依提示領兩張、看已領取數；等待核對或卡片異常時聯絡飯店，勿重發。入住與退房結果以各自的完成畫面為準。
「其他服務」裡的「證件補登」和「支付尾款」都顯示「請至櫃檯辦理」。本館是無人櫃檯。出現洽櫃檯提示時，直接指向畫面上的聯絡方式，不要叫旅客去找現場人員。尾款或補證件範例：「請按上方『客服協助』，再點公司電話聯絡飯店。」扣款不明先請飯店核對，避免重複付款。自助頁沒有 LINE 聯絡卡；不要叫旅客在此掃 LINE。從「其他服務」這兩個入口無法直接上傳證件或刷卡。
「客服協助」有公司電話 04-2223-1157、公務機 0908-653-685；可點號碼聯絡，按「我知道了」關閉。若提示視窗只有「我知道了」，先按它關閉，再按上方「客服協助」。「返回」回上一步；詢問是否回首頁時，按「確認」會清除畫面資料。看到倒數就按「繼續操作」，留在目前步驟。只有已回待機才重新輕觸。
主選單上方「語言」可選繁中、English、日本語；「更多語言 More languages」另有韓文、印尼文、越南文、泰文、簡中。選好回到服務選單。`;

// Button text from the public guest interface, in display order.
const kioskButtons: Record<string, string[]> = {
  "zh-TW": ["掃描入住 QR Code", "輸入訂單編號", "查詢訂單", "現場訂房", "休息", "重新掃描", "資料正確，下一步", "退房", "其他服務", "證件補登", "支付尾款", "客服協助", "繼續操作"],
  "en": ["Scan check-in QR code", "Enter booking number", "Find booking", "Book a room", "Short stay", "Scan again", "Details are correct", "Check-out", "Other services", "Add ID document", "Additional payment", "Help", "Continue"],
  "ja": ["チェックインQRコードを読み取る", "予約番号を入力", "予約を検索", "当日の宿泊予約", "時間利用", "再度読み取る", "内容を確認して次へ", "チェックアウト", "その他のサービス", "身分証の追加登録", "残額のお支払い", "お問い合わせ", "続ける"],
  "ko": ["체크인 QR 코드 스캔", "예약 번호 입력", "예약 조회", "현장 숙박 예약", "대실", "다시 스캔", "확인 후 다음", "체크아웃", "기타 서비스", "신분증 추가 등록", "잔금 결제", "직원 도움", "계속"],
  "id": ["Pindai kode QR check-in", "Masukkan nomor pemesanan", "Cari pemesanan", "Pesan kamar untuk menginap", "Menginap beberapa jam", "Pindai lagi", "Rincian benar, lanjutkan", "Check-out", "Layanan lainnya", "Tambahkan identitas", "Bayar sisa tagihan", "Bantuan", "Lanjutkan"],
  "vi": ["Quét mã QR nhận phòng", "Nhập mã đặt phòng", "Tra cứu đặt phòng", "Đặt phòng qua đêm", "Nghỉ theo giờ", "Quét lại", "Thông tin đúng, tiếp tục", "Trả phòng", "Dịch vụ khác", "Bổ sung giấy tờ", "Thanh toán số tiền còn lại", "Trợ giúp", "Tiếp tục"],
  "th": ["สแกน QR เช็กอิน", "กรอกเลขที่การจอง", "ค้นหาการจอง", "จองห้องพักค้างคืน", "พักรายชั่วโมง", "สแกนอีกครั้ง", "ข้อมูลถูกต้อง ดำเนินการต่อ", "เช็กเอาต์", "บริการอื่น ๆ", "เพิ่มเอกสารประจำตัว", "ชำระยอดคงเหลือ", "ขอความช่วยเหลือ", "ดำเนินการต่อ"],
  "zh-CN": ["扫描入住 QR Code", "输入订单编号", "查询订单", "现场订房", "钟点房", "重新扫描", "资料正确，下一步", "退房", "其他服务", "证件补登", "支付尾款", "客服协助", "继续操作"],
};
const buttonNames = ["scanCode", "enterBookingNumber", "findBooking", "bookRoom", "shortStay", "scanAgain", "confirmDetails", "checkout", "otherServices", "addId", "payBalance", "help", "continue"];

export function getNubosciButtonLabels(language: unknown) {
  const buttons = typeof language === "string" && Object.hasOwn(kioskButtons, language) ? kioskButtons[language] : undefined;
  if (!buttons) return { ok: false, error: "unsupported_screen_language" };
  return { ok: true, language, buttons: Object.fromEntries(buttonNames.map((name, index) => [name, buttons[index]])) };
}
