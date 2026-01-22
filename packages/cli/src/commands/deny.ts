import { denyRepo, getRepoIdFromCwd } from "../settings";

export async function denyCommand(): Promise<void> {
  // Detect current repo
  const repoId = await getRepoIdFromCwd();
  if (!repoId) {
    console.error("Could not detect repository.");
    console.error("Make sure you are in a git repository with a remote origin configured.");
    process.exit(1);
  }

  // Deny the repo
  denyRepo(repoId);

  // Confirm
  console.log(`✗ Capture disabled for: ${repoId}`);

  process.exit(0);
}
