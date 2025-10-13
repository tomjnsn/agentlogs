import { parseArgs } from "util";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { statusCommand } from "./commands/status";

type CommandHandler = (args: string[]) => Promise<void> | void;

const printHelp = () => {
  console.log(`Usage:
  bun run src/index.ts <command> [options]

Commands:
  login                 Authenticate with VibeInsights using device authorization
  status                Check your current login status
  logout                Log out and clear stored credentials
  upload <transcript>   Upload a transcript by path or identifier (stub)
`);
};

const commands: Record<string, CommandHandler> = {
  login: loginCommand,
  status: statusCommand,
  logout: logoutCommand,
  upload: (args) => {
    const [transcript] = args;

    if (!transcript) {
      console.error("The upload command expects a <transcript> argument.");
      printHelp();
      process.exit(1);
    }

    console.log(`Preparing to upload transcript "${transcript}" (stub).`);
    console.log(
      JSON.stringify(
        {
          transcript,
          status: "queued",
          reference: `stub-${transcript}`,
          uploadedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
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
