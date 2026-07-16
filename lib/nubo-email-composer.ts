import { generateWithFallback } from "@/lib/ai-engine";
import {
  assessCompleteness,
  assertCompleteContent,
  shouldRepairContent,
} from "@/lib/nubo-completeness-guard";
import { resolveTrustedContent } from "@/lib/nubo-content-library";

export type CompleteEmailContent = {
  body: string;
  repaired: boolean;
  source: "original" | "trusted-library" | "ai-repair";
  characterCount: number;
  resolvedIssues: string[];
  provider?: string;
  model?: string;
};

type Input = {
  subject: string;
  body: string;
};

const MAX_EMAIL_BODY_LENGTH = 20_000;

function validateLength(body: string) {
  if (body.length > MAX_EMAIL_BODY_LENGTH) {
    throw new Error(
      `完整郵件內容共${body.length}字，超過目前單封郵件上限${MAX_EMAIL_BODY_LENGTH}字，請拆成多封或改用附件。`,
    );
  }
}

function shouldUseTrustedContent(subject: string, body: string) {
  const combined = `${subject}\n${body}`;
  const explicitFullText =
    /(心經全文|全文心經|完整心經|心經完整(?:內容|版本)?|般若波羅蜜多心經全文)/i.test(
      combined,
    );
  const looksLikeTruncatedOriginal =
    /觀自在菩薩/.test(body) &&
    assessCompleteness(subject, body).hasOmissionMarker;
  return explicitFullText || looksLikeTruncatedOriginal;
}

function buildRepairPrompt(subject: string, body: string, attempt: number) {
  return [
    "你是NUBO完整交付寫作Agent。請把下列郵件草稿改寫成可直接寄出的完整正文。",
    `主旨：${subject}`,
    `目前草稿：\n${body}`,
    "硬性要求：",
    "1. 只輸出完整郵件正文，不要解釋做法。",
    "2. 不得使用『以下略過』『以下省略』『其餘略』『未完待續』『待補』或其他省略標記。",
    "3. 使用者要求全文、完整、全部或逐字時，必須交付完整內容，不得用摘要替代。",
    "4. 不得捏造不存在的來源、事實或引用。無法確定的內容要明確標示。",
    "5. 保留繁體中文與適合Email閱讀的段落。",
    `這是第${attempt}次完整性修復。`,
  ].join("\n");
}

export async function prepareCompleteEmailContent({
  subject,
  body,
}: Input): Promise<CompleteEmailContent> {
  const originalBody = body.trim();
  const originalAssessment = assessCompleteness(subject, originalBody);
  const trusted = resolveTrustedContent(subject, originalBody);

  if (trusted && shouldUseTrustedContent(subject, originalBody)) {
    const trustedBody = trusted.body.trim();
    validateLength(trustedBody);
    const assessment = assertCompleteContent(subject, trustedBody);
    return {
      body: trustedBody,
      repaired: trustedBody !== originalBody,
      source: "trusted-library",
      characterCount: assessment.characterCount,
      resolvedIssues: originalAssessment.omissionLabels,
    };
  }

  if (!shouldRepairContent(subject, originalBody)) {
    validateLength(originalBody);
    const assessment = assertCompleteContent(subject, originalBody);
    return {
      body: originalBody,
      repaired: false,
      source: "original",
      characterCount: assessment.characterCount,
      resolvedIssues: [],
    };
  }

  let lastBody = originalBody;
  let lastProvider = "";
  let lastModel = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await generateWithFallback(
      buildRepairPrompt(subject, lastBody, attempt),
      { needsCurrentSources: false },
    );
    const candidate = result.text.trim();
    lastBody = candidate;
    lastProvider = result.provider;
    lastModel = result.model;

    const assessment = assessCompleteness(subject, candidate);
    if (assessment.complete && assessment.characterCount >= 120) {
      validateLength(candidate);
      return {
        body: candidate,
        repaired: true,
        source: "ai-repair",
        characterCount: assessment.characterCount,
        resolvedIssues: originalAssessment.omissionLabels,
        provider: lastProvider,
        model: lastModel,
      };
    }
  }

  throw new Error(
    "NUBO已自動重做2次，但內容仍未通過完整性檢查，因此沒有準備寄送。請重新交辦並說明需要的全文版本或資料來源。",
  );
}
