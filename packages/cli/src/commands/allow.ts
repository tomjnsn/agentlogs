import { allowRepo, getRepoIdFromCwd, readSettings, type Visibility } from "../settings";

export interface AllowCommandOptions {
  visibility?: string;
  public?: boolean;
  team?: boolean;
  private?: boolean;
}

export async function allowCommand(options: AllowCommandOptions = {}): Promise<void> {
  // Detect current repo
  const repoId = await getRepoIdFromCwd();
  if (!repoId) {
    console.error("Could not detect repository.");
    console.error("Make sure you are in a git repository with a remote origin configured.");
    process.exit(1);
  }

  // Determine visibility from options
  let visibility: Visibility | undefined;
  if (options.public) {
    visibility = "public";
  } else if (options.team) {
    visibility = "team";
  } else if (options.private) {
    visibility = "private";
  } else if (options.visibility) {
    const v = options.visibility.toLowerCase();
    if (v !== "public" && v !== "team" && v !== "private") {
      console.error("Invalid visibility. Use 'public', 'team', or 'private'.");
      process.exit(1);
    }
    visibility = v as Visibility;
  }

  // Allow the repo
  allowRepo(repoId, visibility);

  // Confirm
  const settings = readSettings();
  const repoSettings = settings.repos[repoId];

  console.log(`✓ Capture enabled for: ${repoId}`);
  if (repoSettings?.visibility) {
    console.log(`  Visibility: ${repoSettings.visibility}`);
  } else {
    console.log("  Visibility: (server default)");
  }

  process.exit(0);
}
