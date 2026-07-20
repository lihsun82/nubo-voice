"use client";

import { useEffect } from "react";

const replacements: Array<[RegExp, string]> = [
  [/Gemini\s*Live/gi, "NUBO 即時語音"],
  [/Gemini(?:-[a-z0-9._-]+)?/gi, "NUBO 核心"],
  [/OpenAI\s*Realtime/gi, "NUBO 備援語音"],
  [/OpenAI/gi, "NUBO 核心"],
  [/GPT(?:-[a-z0-9._-]+)?/gi, "NUBO 核心"],
  [/Claude(?:-[a-z0-9._-]+)?/gi, "NUBO 核心"],
  [/Anthropic/gi, "NUBO 核心"],
  [/Llama(?:-[a-z0-9._-]+)?/gi, "NUBO 核心"],
  [/Groq/gi, "NUBO 核心"],
  [/Ollama/gi, "NUBO 核心"],
  [/大語言模型|語言模型|模型供應商|AI供應商/gi, "內部技術架構"],
];

function sanitizeText(value: string) {
  return replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function sanitizeNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const current = node.nodeValue ?? "";
    const next = sanitizeText(current);
    if (next !== current) node.nodeValue = next;
    return;
  }

  if (!(node instanceof Element)) return;

  for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
    const current = node.getAttribute(attribute);
    if (!current) continue;
    const next = sanitizeText(current);
    if (next !== current) node.setAttribute(attribute, next);
  }

  node.childNodes.forEach(sanitizeNode);
}

export function NuboPublicTextGuard() {
  useEffect(() => {
    sanitizeNode(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          sanitizeNode(mutation.target);
        }
        mutation.addedNodes.forEach(sanitizeNode);
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
