#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as remember from "./tools/remember.js";
import * as recall from "./tools/recall.js";
import * as listTool from "./tools/list.js";
import * as forget from "./tools/forget.js";
import * as gcTool from "./tools/gc.js";

const server = new McpServer({
  name: "branchwise",
  version: "0.2.1",
});

server.tool(
  "remember_for_branch",
  "Save a memory entry scoped to the current git branch. Use this to persist decisions, patterns, debugging findings, or context across sessions.",
  {
    entry: z.string().min(1).max(10_000).describe("The memory entry to save"),
    branch: z.string().max(500).optional().describe("Target branch (defaults to current)"),
  },
  async (input) => {
    const result = await remember.execute(input);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

server.tool(
  "recall_branch_memory",
  "Read all memory entries for the current (or specified) git branch.",
  {
    branch: z.string().max(500).optional().describe("Branch to recall (defaults to current)"),
  },
  async (input) => {
    const result = await recall.execute(input);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

server.tool(
  "list_branch_memories",
  "List all branches that have stored memory in this repository.",
  {},
  async () => {
    const result = await listTool.execute();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

server.tool(
  "forget_branch_memory",
  "Delete all memory for a specific branch.",
  {
    branch: z.string().min(1).max(500).describe("Branch name whose memory to delete"),
  },
  async (input) => {
    const result = await forget.execute(input);
    return { content: [{ type: "text" as const, text: result }] };
  },
);

server.tool(
  "gc_branch_memories",
  "Remove memory for branches that no longer exist locally. Cleans up orphaned branch memories.",
  {},
  async () => {
    const result = await gcTool.execute();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Branchwise MCP server error:", err);
  process.exit(1);
});
