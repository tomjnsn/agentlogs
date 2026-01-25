#!/usr/bin/env node
import { Command } from "commander";
import { allowCommand } from "./commands/allow";
import { denyCommand } from "./commands/deny";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { settingsCommand } from "./commands/settings";
import { statusCommand } from "./commands/status";
// Claude Code commands
import { hookCommand as claudeCodeHookCommand } from "./commands/claudecode/hook";
import { syncCommand } from "./commands/claudecode/sync";
import { claudeCodeUploadCommand } from "./commands/claudecode/upload";
// Codex commands
import { codexUploadCommand } from "./commands/codex/upload";
// OpenCode commands
import { opencodeUploadCommand } from "./commands/opencode/upload";
import { hookCommand as openCodeHookCommand } from "./commands/opencode/hook";
// Service and MCP commands
import { startService, stopService, serviceStatus, serviceLogs } from "./commands/service";
import { mcpCommand } from "./commands/mcp";

const program = new Command();

program
  .name("agentlogs")
  .description("CLI tools for working with AgentLogs accounts and transcripts from Claude Code and Codex");

program
  .command("login")
  .description("Authenticate with AgentLogs using device authorization")
  .option("--dev", "Login to development environment (http://localhost:3000)")
  .action(async (options: { dev?: boolean }) => {
    await loginCommand({ dev: options.dev });
  });

program
  .command("status")
  .description("Check your current login status")
  .action(async () => {
    await statusCommand();
  });

program
  .command("logout")
  .description("Log out and clear stored credentials")
  .option("--dev", "Logout from development environment")
  .action(async (options: { dev?: boolean }) => {
    await logoutCommand({ dev: options.dev });
  });

const claudecode = program.command("claudecode").description("Claude Code transcript utilities for AgentLogs");

claudecode
  .command("upload")
  .argument("<transcript>", "Path or alias for a transcript JSONL file")
  .description("Upload a transcript JSONL file to AgentLogs")
  .action(async (transcript: string) => {
    await claudeCodeUploadCommand(transcript);
  });

claudecode
  .command("hook")
  .description("Process Claude Code hook input from stdin")
  .action(async () => {
    await claudeCodeHookCommand();
  });

const codex = program.command("codex").description("Codex transcript utilities for AgentLogs");

codex
  .command("upload")
  .argument("<transcript>", "Path or alias for a Codex transcript JSONL file")
  .description("Upload a Codex transcript JSONL file to AgentLogs")
  .action(async (transcript: string) => {
    await codexUploadCommand(transcript);
  });

const opencode = program.command("opencode").description("OpenCode transcript utilities for AgentLogs");

opencode
  .command("upload")
  .argument("<sessionId>", "OpenCode session ID to upload")
  .description("Upload an OpenCode session transcript to AgentLogs")
  .action(async (sessionId: string) => {
    await opencodeUploadCommand(sessionId);
  });

opencode
  .command("hook")
  .description("Process OpenCode hook input from stdin")
  .action(async () => {
    await openCodeHookCommand();
  });

claudecode
  .command("sync")
  .argument("[claudeDir]", "Optional Claude data directory (defaults to ~/.claude)")
  .option("-r, --repo <repoId>", "Only sync transcripts for the provided repo identifier")
  .description("Upload all local Claude Code transcripts that are missing or outdated on the server")
  .action(async (claudeDir: string | undefined, options: { repo?: string }) => {
    await syncCommand({
      claudeDir,
      repoFilter: options.repo,
    });
  });

program
  .command("settings")
  .description("View and modify AgentLogs settings")
  .option("--allowMode <mode>", "Set allow mode: 'allowlist' or 'denylist'")
  .action(async (options: { allowMode?: string }) => {
    await settingsCommand({ allowMode: options.allowMode });
  });

program
  .command("allow")
  .description("Allow capture for the current repository")
  .option("--visibility <visibility>", "Set visibility: 'public', 'team', or 'private'")
  .option("--public", "Set visibility to public")
  .option("--team", "Set visibility to team")
  .option("--private", "Set visibility to private")
  .action(async (options: { visibility?: string; public?: boolean; team?: boolean; private?: boolean }) => {
    await allowCommand(options);
  });

program
  .command("deny")
  .description("Deny capture for the current repository")
  .action(async () => {
    await denyCommand();
  });

// Service commands
const service = program.command("service").description("Manage the agentlogs background service");

service
  .command("start")
  .description("Start the background service")
  .action(async () => {
    await startService();
  });

service
  .command("stop")
  .description("Stop the background service")
  .action(async () => {
    await stopService();
  });

service
  .command("status")
  .description("Show service status")
  .action(async () => {
    await serviceStatus();
  });

service
  .command("logs")
  .description("Tail the watcher event logs")
  .action(async () => {
    await serviceLogs();
  });

// MCP server command (spawned by Codex)
program
  .command("mcp")
  .description("Start MCP server (used by Codex)")
  .action(async () => {
    await mcpCommand();
  });

program.showHelpAfterError("(add --help for additional information)");

program.parseAsync().catch((error) => {
  console.error("CLI encountered an unexpected error.");
  console.error(error);
  process.exit(1);
});
