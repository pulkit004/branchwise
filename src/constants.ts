import { homedir } from "node:os";
import { join } from "node:path";

export const BRANCHWISE_DIR = join(homedir(), ".claude", "branch-memory");
export const MAX_MEMORY_LINES = 200;
export const META_FILE = "_meta.json";
export const CURRENT_BRANCH_FILE = ".current-branch";
export const BRANCHES_DIR = "branches";
export const DETACHED_DIR = "_detached";
export const BRANCH_SEPARATOR = "--";
