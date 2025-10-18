#!/usr/bin/env node
import { Command } from "commander";
import { hookCommand } from "./commands/hook";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { statusCommand } from "./commands/status";
import { syncCommand } from "./commands/sync";
import { uploadCommand } from "./commands/upload";

const program = new Command();

program
  .name("vibeinsights")
  .description("CLI tools for working with Vibe Insights accounts and transcripts from Claude Code and Codex");

program
  .command("login")
  .description("Authenticate with Vibe Insights using device authorization")
  .action(async () => {
    await loginCommand();
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
  .action(async () => {
    await logoutCommand();
  });

const claudecode = program.command("claudecode").description("Claude Code transcript utilities for Vibe Insights");

claudecode
  .command("upload")
  .argument("<transcript>", "Path or alias for a transcript JSONL file")
  .description("Upload a transcript JSONL file to Vibe Insights")
  .action(async (transcript: string) => {
    await uploadCommand(transcript, "claude-code");
  });

claudecode
  .command("hook")
  .description("Process Claude Code hook input from stdin")
  .action(async () => {
    await hookCommand();
  });

const codex = program.command("codex").description("Codex transcript utilities for Vibe Insights");

codex
  .command("upload")
  .argument("<transcript>", "Path or alias for a Codex transcript JSONL file")
  .description("Upload a Codex transcript JSONL file to Vibe Insights")
  .action(async (transcript: string) => {
    await uploadCommand(transcript, "codex");
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

program.showHelpAfterError("(add --help for additional information)");

program.parseAsync().catch((error) => {
  console.error("CLI encountered an unexpected error.");
  console.error(error);
  process.exit(1);
});
