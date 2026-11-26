type ShortReply = "accept" | "decline" | "acknowledge";

export type NuboFollowUp = { reply: ShortReply; question: string };

const NAVIGATION = /指引|指路|導航|地圖|地址|路線|怎麼[走去到]|如何[走去到]|帶[您你]去|帶路|地點|位置|directions|\bmap\b|\broute\b|how to get|行き方|地図|道順|길\s*안내|가는\s*길|지도/iu;
const GUEST_SERVICE = /備品|毛巾|浴巾|礦泉水|送物|房務|清潔|維修|客訴|聯絡飯店|(?:請|找|通知|聯絡|轉交|反映給).{0,10}(?:人員|櫃[檯台]|館方|同仁|經理)|amenit|towels?|housekeeping|maintenance|contact.{0,12}(?:hotel|staff)|タオル|アメニティ|スタッフ|수건|비품|직원/iu;
const ARRIVAL = /訂房|入住|住宿|休息|退房|check[ -]?(?:in|out)|book(?:ing| a room)|make a reservation|チェックイン|チェックアウト|予約|체크인|체크아웃|예약/iu;

const THANK_YOU = /^(?:好(?:的)?|知道了|了解(?:了)?|明白(?:了)?)?(?:謝謝[您你]?|谢谢[您你]?)$|^(?:ok(?:ay)?(?:thanks?|thankyou)|thanks?(?:verymuch)?|thankyou(?:verymuch)?|ありがとうございました|ありがとうございます|ありがとう|감사합니다|고마워요|cảmơn(?:bạn|ạ)?|camon)$/u;
const POLITE_DECLINE = /^(?:不(?:用|要)(?:了)?|不需要|不必(?:了)?|沒關係|没关系)(?:謝謝[您你]?|谢谢[您你]?)?$|^(?:noneed(?:thanks?|thankyou)?|nothanks?|nothankyou|結構です|もう大丈夫です|아니요괜찮아요|khôngcần(?:cảmơn)?|khongcan(?:camon)?)$/u;
const BACKCHANNEL = /^(?:[嗯哦喔唔]+|好(?:的|呀|啊|喔|哦|唷|啦)?|了解(?:了)?|明白(?:了)?|知道了|收到|對(?:的)?|对(?:的)?|是(?:的)?|沒問題|没问题|ok(?:ay)?|isee|はい|わかりました|네|예|알겠습니다|vâng|vângạ|dạ|hiểurồi)$/u;
const ASSISTANT_NAME = /^(?:nubo|努寶|努宝)$/u;
const STOCK_QUESTIONS = [
  /^(?:那|請問|请问)?(?:您|你)?(?:還|还)?有(?:沒有|没有|什[麼么]|甚[麼么]|[麼么]|其他|別的|别的)(?:我)?(?:需要|可以|想)(?:我)?(?:再)?(?:幫|帮|協|协)/u,
  /^(?:您|你)?(?:還|还)有需要(?:我)?(?:幫忙|帮忙|協助|协助)(?:的地方|的事|的嗎|的吗|嗎|吗)?$/u,
  /^(?:(?:isthere|doyouneed)?anythingelse(?:that)?(?:i|we|you)?(?:can|could|need|would|help)|letmeknowif(?:you|theres))/u,
  /^(?:ほか|他)に何か(?:お手伝い|お困り|ご用|私にできる)/u,
  /^(?:또|다른)(?:무엇을|도움이|필요한).*(?:도와|필요|있으)/u,
  /^(?:(?:quýkhách|bạn)(?:còn)?cần|còn).*(?:hỗtrợ|giúp).*(?:không|gìkhác)/u,
];
const STOCK_INVITATION = /^(?:那|那麼|那么|若|如果|如)?(?:您|你)?(?:還|还)?(?:(?:有(?:任何)?需要.*)?(?:隨時|随时)|(?:隨時|随时)有需要).*(?:跟我[說说]|告訴我|告诉我|找我|聯絡我|联系我|問我|问我)/u;

function normalizeSpeech(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\s]/gu, "");
}

export function readNuboShortReply(text: string): ShortReply | null {
  const phrase = normalizeSpeech(text);
  if (THANK_YOU.test(phrase)) return "acknowledge";
  if (POLITE_DECLINE.test(phrase)) return "decline";
  if (/^(?:嗯+)?(?:需要|要|想要|需要的|要的|我需要|我要|好(?:的|呀|啊|喔|哦|唷|啦)?|可以(?:的|啊|喔)?|幫我|請幫我|麻煩(?:你|您)?|對(?:的)?|是(?:的)?|沒問題)$/u.test(phrase) ||
      /^(?:yes(?:please)?|yeah|yep|sure|ok(?:ay)?|please|goahead|yesidlikeit|はい(?:お願いします)?|お願いします|お願い|네(?:부탁드려요)?|예|좋아요|부탁드려요)$/u.test(phrase)) return "accept";
  if (/^(?:嗯+)?(?:不需要|不用(?:了)?|不用謝謝|不要(?:了)?|先不用|先不要|暫時不用|算了|先算了|不必(?:了)?|沒有|沒關係|沒事|不是|no(?:thanks?|thankyou)?|noneed|nothistime|いいえ|結構です|大丈夫です|아니요|괜찮아요|필요없어요)$/u.test(phrase)) return "decline";
  if (/^(?:嗯+|哦+|喔+|謝謝|了解|明白|知道了|收到|thanks?|thankyou|isee|わかりました|ありがとうございます|감사합니다|알겠습니다)$/u.test(phrase)) return "acknowledge";
  return null;
}

/** Backchannels and polite endings do not start another service turn. */
export function isNuboConversationCloser(text: string, previousQuestion: string): boolean {
  const phrase = normalizeSpeech(text);
  if (THANK_YOU.test(phrase) || POLITE_DECLINE.test(phrase) || ASSISTANT_NAME.test(phrase)) return true;
  if (previousQuestion) return false;
  return BACKCHANNEL.test(phrase) || readNuboShortReply(text) === "decline";
}

/** Keep the answer and any specific follow-up before a generic invitation. */
export function stripNuboStockClosing(text: string): { text: string; removed: boolean } {
  for (const clause of text.matchAll(/[^。！？.!?，,；;\n]+/gu)) {
    const phrase = normalizeSpeech(clause[0]);
    if (!(STOCK_INVITATION.test(phrase) || STOCK_QUESTIONS.some((pattern) => pattern.test(phrase)))) continue;
    const prefix = text.slice(0, clause.index).trim().replace(/[，,；;]+$/u, "").trim();
    return { text: BACKCHANNEL.test(normalizeSpeech(prefix)) ? "" : prefix, removed: true };
  }
  return { text: text.trim(), removed: false };
}

export function latestNuboQuestion(assistantText: string): string {
  const answer = stripNuboStockClosing(assistantText).text;
  const explicit = [...answer.matchAll(/[^。！？!?\n]+[？?]/gu)].at(-1)?.[0].trim();
  if (explicit) return explicit;
  const last = answer.split(/[。！.!\n]+/u).filter(Boolean).at(-1)?.trim() ?? "";
  return /(?:嗎|吗|呢|ますか|ですか|까요|나요)$/u.test(last) ||
    /要不要|需不需要|would you like|do you want|should i|want me to/iu.test(last) ? last : "";
}

export function isNuboNavigationRequest(text: string): boolean {
  return NAVIGATION.test(text);
}

/** A contextual reply can authorize only the guest action just offered. */
export function correctNuboGuestFollowUp(tool: string | undefined, followUp: NuboFollowUp | null) {
  if (!followUp || (tool !== "guest_service_alert" && tool !== "notify_arrival_intent")) return null;

  const { reply, question } = followUp;
  const navigation = isNuboNavigationRequest(question);
  const relevantAction = (tool === "guest_service_alert" ? GUEST_SERVICE : ARRIVAL).test(question);
  if (reply === "accept" && relevantAction && !navigation) return null;

  return {
    ok: false,
    code: "short_reply_continues_previous_question",
    previousQuestion: question || null,
    reply,
    instruction: navigation
      ? "這是對上一個地點指引問句的回答。若旅客答應，繼續同一個地點的指引或地圖。若地點不明，只確認地點。若旅客婉拒，簡短確認即可。"
      : "承接前一個明確確認事項。此回合沒有新需求時，留在聆聽。",
  };
}
