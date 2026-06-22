import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import { googleApiFetch } from "@/lib/google-auth";

const pendingFile = path.join(process.cwd(), "data", "pending-email-actions.json");
