#!/usr/bin/env node

import { parseArgs } from "util";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { statusCommand } from "./commands/status";
import { uploadCommand } from "./commands/upload";

type CommandHandler = (args: string[]) => Promise<void> | void;

const printHelp = () => {
  console.log(`Usage:
  bun run src/index.ts <command> [options]

Commands:
  login                 Authenticate with VibeInsights using device authorization
  status                Check your current login status
  logout                Log out and clear stored credentials
  claudecode upload <transcript>
                        Upload a transcript JSONL file to Vibe Insights
`);
};

const claudecodeCommands: Record<string, CommandHandler> = {
  upload: uploadCommand,
};

const commands: Record<string, CommandHandler> = {
  login: loginCommand,
  status: statusCommand,
  logout: logoutCommand,
  claudecode: (args) => {
    const [subcommand, ...subcommandArgs] = args;

    if (!subcommand) {
      console.error('The "claudecode" command expects a subcommand.');
      printHelp();
      process.exit(1);
    }

    const handler = claudecodeCommands[subcommand];

    if (!handler) {
      console.error(`Unknown claudecode subcommand "${subcommand}".`);
      printHelp();
      process.exit(1);
    }

    return handler(subcommandArgs);
  },
};

const main = async () => {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [command, ...commandArgs] = positionals;

  if (!command) {
    printHelp();
    process.exit(1);
  }

  const handler = commands[command];

  if (!handler) {
    console.error(`Unknown command "${command}".`);
    printHelp();
    process.exit(1);
  }

  await handler(commandArgs);
};

main().catch((error) => {
  console.error("CLI encountered an unexpected error.");
  console.error(error);
  process.exit(1);
});
