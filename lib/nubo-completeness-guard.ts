const FULL_REQUEST_PATTERN =
  /(全文|完整(?:內容|版本|地)?|全部內容|逐字|一字不漏|不要省略|不得省略|不可省略|完整做好|完整完成)/i;

const OMISSION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "以下略過", pattern: /以下(?:內容)?(?:略|略過|省略)/i },
  { label: "其餘省略", pattern: /(?:其餘|後續|剩餘)(?:內容)?(?:略|略過|省略)/i },
  { label: "內容省略", pattern: /(?:內容|全文)(?:已)?(?:略|略過|省略)/i },
  { label: "未完待續", pattern: /未完待續/i },
  { label: "待補", pattern: /(?:待補|後補|稍後補上)/i },
  { label: "括號省略", pattern: /[（(]\s*(?:以下)?(?:略|略過|省略)\s*[）)]/i },
];

export type CompletenessAssessment = {
  requestedFull: boolean;
  hasOmissionMarker: boolean;
  omissionLabels: string[];
  characterCount: number;
  complete: boolean;
};

export function meaningfulCharacterCount(value: string) {
  return value.replace(/\s/g, "").length;
}

export function assessCompleteness(subject: string, body: string): CompletenessAssessment {
  const combined = `${subject}\n${body}`;
  const omissionLabels = OMISSION_PATTERNS.filter(({ pattern }) =>
    pattern.test(body),
  ).map(({ label }) => label);
  const requestedFull = FULL_REQUEST_PATTERN.test(combined);
  const characterCount = meaningfulCharacterCount(body);
  const hasOmissionMarker = omissionLabels.length > 0;

  return {
    requestedFull,
    hasOmissionMarker,
    omissionLabels,
    characterCount,
    complete: !hasOmissionMarker && characterCount > 0,
  };
}

export function shouldRepairContent(subject: string, body: string) {
  const assessment = assessCompleteness(subject, body);
  return assessment.hasOmissionMarker || (assessment.requestedFull && assessment.characterCount < 120);
}

export function assertCompleteContent(subject: string, body: string) {
  const assessment = assessCompleteness(subject, body);
  if (!assessment.complete) {
    throw new Error(
      `成果仍含省略標記：${assessment.omissionLabels.join("、") || "內容不完整"}`,
    );
  }
  return assessment;
}
