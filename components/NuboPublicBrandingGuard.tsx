"use client";

import { useEffect } from "react";

const PUBLIC_IDENTITY = "LEO開發的LLM語言模型";

const SENSITIVE_PATTERNS = [
  /Gemini(?:\s+Live)?/gi,
  /OpenAI/gi,
  /ChatGPT/gi,
  /GPT[-\s]?[\w.:-]*/gi,
  /Claude(?:[-\s]?[\w.:-]*)?/gi,
  /Groq/gi,
  /Ollama/gi,
  /Qwen(?:[-\s]?[\w.:-]*)?/gi,
  /Llama(?:[-\s]?[\w.:-]*)?/gi,
  /Google\s*(?:AI|Generative\s*Language)/gi,
  /AI\s*(?:模型|語言模型)/gi,
  /模型(?:名稱|版本|供應商|提供者)/gi,
];

function sanitizePublicText(value: string) {
  let next = value
    .replace(/AI\s*引擎/gi, "語言核心")
    .replace(/NUBO\s*收件(?:匣|夾)/g, "工作紀錄");

  for (const pattern of SENSITIVE_PATTERNS) {
    next = next.replace(pattern, PUBLIC_IDENTITY);
  }

  return next.replace(
    new RegExp(`(?:${PUBLIC_IDENTITY}[\s/｜·、]*){2,}`, "g"),
    PUBLIC_IDENTITY,
  );
}

function sanitizeNode(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const current = root.nodeValue ?? "";
    const sanitized = sanitizePublicText(current);
    if (sanitized !== current) root.nodeValue = sanitized;
    return;
  }

  if (!(root instanceof Element)) return;
  if (root.matches("script, style, textarea, input, code, pre")) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.matches("script, style, textarea, input, code, pre")) {
      const current = node.nodeValue ?? "";
      const sanitized = sanitizePublicText(current);
      if (sanitized !== current) node.nodeValue = sanitized;
    }
    node = walker.nextNode();
  }
}

export function NuboPublicBrandingGuard() {
  useEffect(() => {
    sanitizeNode(document.body);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          sanitizeNode(record.target);
          continue;
        }
        for (const node of record.addedNodes) sanitizeNode(node);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
