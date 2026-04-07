import { homedir } from "node:os";
import { join } from "node:path";

export const BRANCHWISE_DIR = join(homedir(), ".claude", "branch-memory");
export const MAX_MEMORY_LINES = 200;
export const META_FILE = "_meta.json";
export const BRANCHES_DIR = "branches";
export const DETACHED_DIR = "_detached";
export const DETACHED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSIONS_DIR = ".sessions";
