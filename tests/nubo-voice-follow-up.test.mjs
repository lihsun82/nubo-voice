import assert from "node:assert/strict";
import test from "node:test";
import {
  correctNuboGuestFollowUp,
  isNuboConversationCloser,
  latestNuboQuestion,
  stripNuboStockClosing,
} from "../lib/nubo-voice-follow-up.ts";

test("short courtesy turns stay quiet after the answer", () => {
  for (const end of ["好的，謝謝。", "不用了，謝謝。", "嗯。", "NUBO", "No thanks.", "ありがとうございます。", "Cảm ơn."]) {
    assert.equal(isNuboConversationCloser(end, ""), true, end);
  }
  for (const next of ["謝謝，請問退房時間？", "不用毛巾，給我水", "你還在嗎？", "NUBO，我要訂房。", "はい、二人です"]) {
    assert.equal(isNuboConversationCloser(next, ""), false, next);
  }
});

test("a short answer still continues a specific service question", () => {
  const previousQuestion = "要我幫您指引湖心亭的路線嗎？";
  assert.equal(isNuboConversationCloser("好的", previousQuestion), false);
  assert.equal(isNuboConversationCloser("不用了，謝謝。", previousQuestion), true);
  const correction = correctNuboGuestFollowUp("guest_service_alert", { reply: "accept", question: previousQuestion });
  assert.match(correction.instruction, /同一個地點/);
});

test("only generic service closings are removed from an otherwise useful reply", () => {
  for (const filler of ["好的，隨時有需要隨時跟我說！", "有麼需要協助的地方？", "好的，那有需要隨時再告訴我喔。", "請問有什麼可以協助您的嗎？"]) {
    assert.deepEqual(stripNuboStockClosing(filler), { text: "", removed: true }, filler);
  }
  const question = "請問您想在幾點入住？";
  const reply = `我可以幫您查看房況。${question}還有其他需要幫忙的嗎？`;
  assert.equal(latestNuboQuestion(reply), question);
  const availability = "休息三小時是八百九十元。";
  assert.deepEqual(stripNuboStockClosing(`${availability}有什麼需要協助的地方嗎？`), { text: availability, removed: true });
  assert.equal(stripNuboStockClosing("如需協助搬行李，請撥畫面上方的電話。").removed, false);
});
