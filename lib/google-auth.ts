import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";

const tokenFile = path.join(process.cwd(), "data", "google-auth.json");
const stateFile = path.join(process.cwd(), "data", "google-oauth-state.json");
