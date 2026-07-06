import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import type { NuboTask } from "@/lib/task-types";

export type ArtifactFormat = "md" | "html" | "json";

export type NuboArtifact = {
  id: string;
  taskId: string;
  title: string;
  format: ArtifactFormat;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

const artifactRoot = path.join(process.cwd(), "data", "artifacts");
const artifactIndexFile = path.join(process.cwd(), "data", "artifacts.json");

function safeName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "nubo-artifact";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mimeType(format: ArtifactFormat) {
  if (format === "html") return "text/html; charset=utf-8";
  if (format === "json") return "application/json; charset=utf-8";
  return "text/markdown; charset=utf-8";
}

function renderHtml(task: NuboTask, output: string) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(task.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px auto; max-width: 880px; line-height: 1.75; color: #15171a; }
    h1 { line-height: 1.2; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f5f6f8; padding: 20px; border-radius: 16px; }
    .meta { color: #667085; font-size: 14px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(task.title)}</h1>
  <div class="meta">NUBO Artifact｜${escapeHtml(new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }))}</div>
  <pre>${escapeHtml(output)}</pre>
</body>
</html>`;
}

function renderContent(task: NuboTask, output: string, format: ArtifactFormat) {
  if (format === "html") return renderHtml(task, output);
  if (format === "json") {
    return JSON.stringify(
      {
        taskId: task.id,
        title: task.title,
        kind: task.kind,
        createdAt: new Date().toISOString(),
        output,
      },
      null,
      2,
    );
  }
  return `# ${task.title}\n\n${output}\n`;
}

export async function listArtifacts(limit = 50): Promise<NuboArtifact[]> {
  const artifacts = await readJson<NuboArtifact[]>(artifactIndexFile, []);
  return artifacts.slice(-limit).reverse();
}

export async function getArtifact(id: string): Promise<NuboArtifact | null> {
  return (await listArtifacts(500)).find((artifact) => artifact.id === id) ?? null;
}

export async function readArtifactContent(id: string) {
  const artifact = await getArtifact(id);
  if (!artifact) return null;
  const filePath = path.join(artifactRoot, artifact.filename);
  return { artifact, content: await fs.readFile(filePath, "utf8") };
}

export async function createArtifacts(
  task: NuboTask,
  output: string,
  formats: ArtifactFormat[] = ["md", "html", "json"],
): Promise<NuboArtifact[]> {
  await fs.mkdir(artifactRoot, { recursive: true });
  const createdAt = new Date().toISOString();
  const base = `${safeName(task.title)}-${Date.now()}`;
  const current = await readJson<NuboArtifact[]>(artifactIndexFile, []);
  const artifacts: NuboArtifact[] = [];

  for (const format of formats) {
    const id = crypto.randomUUID();
    const filename = `${base}.${format}`;
    const content = renderContent(task, output, format);
    const filePath = path.join(artifactRoot, filename);
    await fs.writeFile(filePath, content, "utf8");
    const stat = await fs.stat(filePath);
    artifacts.push({
      id,
      taskId: task.id,
      title: task.title,
      format,
      filename,
      mimeType: mimeType(format),
      sizeBytes: stat.size,
      createdAt,
    });
  }

  await writeJson(artifactIndexFile, [...current, ...artifacts].slice(-500));
  return artifacts;
}

export function artifactLinks(artifacts: NuboArtifact[]) {
  if (artifacts.length === 0) return "";
  return artifacts
    .map((artifact) => `- ${artifact.format.toUpperCase()}：/api/artifacts/${artifact.id}（${artifact.filename}）`)
    .join("\n");
}
