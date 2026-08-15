type JsonRecord = Record<string, unknown>;

const DEFAULT_OWNER = "lihsun82";
const DEFAULT_REPO = "AinuboX1";
const DEFAULT_BRANCH = "main";
const FAILURE_STATE_PATH = "automation_state/last_failure.json";
const WORKFLOW_FILE = "price-radar.yml";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getConfig() {
  const token = process.env.AINUBO_GITHUB_TOKEN?.trim();
  if (!token) throw new Error("AINUBO_GITHUB_TOKEN尚未設定");
  return {
    token,
    owner: process.env.AINUBO_GITHUB_OWNER?.trim() || DEFAULT_OWNER,
    repo: process.env.AINUBO_GITHUB_REPO?.trim() || DEFAULT_REPO,
    branch: process.env.AINUBO_GITHUB_BRANCH?.trim() || DEFAULT_BRANCH,
  };
}

async function githubJson(path: string) {
  const config = getConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NUBO-AinuboX1-Live-Bridge",
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(text(record(body).message) || `GitHub API錯誤：${response.status}`);
  }
  return response.json();
}

async function readRepoJsonFile(path: string) {
  const config = getConfig();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const payload = record(
    await githubJson(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`,
    ),
  );
  const encoded = text(payload.content).replace(/\s+/g, "");
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(decoded) as unknown;
}

function parseGitHubTime(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export type AinuboX1LiveStatus = {
  connected: boolean;
  repository: string;
  branch: string;
  workflow: string;
  workflowStatus: string;
  workflowConclusion: string;
  workflowRunId: number | null;
  workflowStartedAt: string | null;
  workflowUpdatedAt: string | null;
  lastFailure: unknown;
  lastFailureSlot: string | null;
  lastFailureRecordedAt: string | null;
  latestRunAgeMinutes: number | null;
};

export async function fetchAinuboX1LiveStatus(): Promise<AinuboX1LiveStatus> {
  const config = getConfig();

  const [runsPayload, failureResult] = await Promise.all([
    githubJson(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/runs?branch=${encodeURIComponent(config.branch)}&per_page=5`,
    ),
    readRepoJsonFile(FAILURE_STATE_PATH).catch(() => null),
  ]);

  const runs = Array.isArray(record(runsPayload).workflow_runs)
    ? (record(runsPayload).workflow_runs as unknown[])
    : [];
  const latest = record(runs[0]);
  const updatedMs = parseGitHubTime(latest.updated_at);
  const latestRunAgeMinutes = updatedMs === null
    ? null
    : Math.max(0, Math.round((Date.now() - updatedMs) / 60_000));
  const failure = record(failureResult);

  return {
    connected: true,
    repository: `${config.owner}/${config.repo}`,
    branch: config.branch,
    workflow: WORKFLOW_FILE,
    workflowStatus: text(latest.status, "unknown"),
    workflowConclusion: text(latest.conclusion, "unknown"),
    workflowRunId:
      typeof latest.id === "number" && Number.isFinite(latest.id) ? latest.id : null,
    workflowStartedAt: text(latest.run_started_at) || text(latest.created_at) || null,
    workflowUpdatedAt: text(latest.updated_at) || null,
    lastFailure: failureResult,
    lastFailureSlot: text(failure.slot) || null,
    lastFailureRecordedAt: text(failure.recorded_at) || null,
    latestRunAgeMinutes,
  };
}
