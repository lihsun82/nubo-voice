import { promises as fs } from "node:fs";
import path from "node:path";

export type NuboArtifactFormat = "word" | "excel";

export type NuboArtifactRecord = {
  id: string;
  format: NuboArtifactFormat;
  title: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  sizeBytes: number;
};

const ARTIFACT_ROOT =
  process.env.NUBO_ARTIFACT_DIR?.trim() ||
  path.join(process.cwd(), "data", "artifacts");

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFilename(value: string) {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || "NUBO文件";
}

function buildWordHtml(title: string, content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) =>
      `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: "Microsoft JhengHei", Arial, sans-serif; margin: 36pt; line-height: 1.7; }
h1 { font-size: 20pt; margin-bottom: 18pt; }
p { font-size: 12pt; margin: 0 0 10pt 0; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${paragraphs}
</body>
</html>`;
}

function buildExcelHtml(
  title: string,
  columns: string[],
  rows: Array<Array<string | number | boolean | null>>,
) {
  const header = columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Excel.Sheet">
<title>${escapeHtml(title)}</title>
<style>
table { border-collapse: collapse; font-family: "Microsoft JhengHei", Arial, sans-serif; }
th, td { border: 1px solid #999; padding: 6px 10px; white-space: pre-wrap; }
th { font-weight: 700; background: #f2f2f2; }
</style>
</head>
<body>
<table>
<thead><tr>${header}</tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}

export async function createNuboArtifact(input: {
  format: NuboArtifactFormat;
  title: string;
  content?: string;
  columns?: string[];
  rows?: Array<Array<string | number | boolean | null>>;
}): Promise<NuboArtifactRecord> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const base = safeFilename(input.title);

  let filename: string;
  let mimeType: string;
  let fileContent: string;

  if (input.format === "word") {
    const content = String(input.content ?? "").trim();
    if (!content) throw new Error("Word文件缺少內容");
    filename = `${base}.doc`;
    mimeType = "application/msword; charset=utf-8";
    fileContent = buildWordHtml(input.title, content);
  } else {
    const columns = Array.isArray(input.columns) ? input.columns : [];
    const rows = Array.isArray(input.rows) ? input.rows : [];
    if (columns.length === 0) throw new Error("Excel文件缺少欄位名稱");
    if (rows.length === 0) throw new Error("Excel文件缺少資料列");
    filename = `${base}.xls`;
    mimeType = "application/vnd.ms-excel; charset=utf-8";
    fileContent = buildExcelHtml(input.title, columns, rows);
  }

  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const filePath = path.join(ARTIFACT_ROOT, `${id}-${filename}`);
  await fs.writeFile(filePath, `\ufeff${fileContent}`, "utf8");
  const stat = await fs.stat(filePath);

  const record: NuboArtifactRecord = {
    id,
    format: input.format,
    title: input.title,
    filename,
    mimeType,
    createdAt,
    sizeBytes: stat.size,
  };

  await fs.writeFile(
    path.join(ARTIFACT_ROOT, `${id}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );

  return record;
}

export async function readNuboArtifact(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("文件識別碼格式不正確");
  }

  const metadataPath = path.join(ARTIFACT_ROOT, `${id}.json`);
  const record = JSON.parse(
    await fs.readFile(metadataPath, "utf8"),
  ) as NuboArtifactRecord;
  const filePath = path.join(ARTIFACT_ROOT, `${id}-${record.filename}`);
  const buffer = await fs.readFile(filePath);
  return { record, buffer };
}
