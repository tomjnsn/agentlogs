#!/usr/bin/env bun
/**
 * Publishes the CLI package to npm by bumping the version and pushing a tag.
 *
 * Usage:
 *   bun scripts/publish-cli.ts patch   # 0.0.2 -> 0.0.3
 *   bun scripts/publish-cli.ts minor   # 0.0.2 -> 0.1.0
 *   bun scripts/publish-cli.ts major   # 0.0.2 -> 1.0.0
 */

import { $ } from "bun";

const PACKAGE_PATH = "./packages/cli/package.json";

type BumpType = "patch" | "minor" | "major";

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function main() {
  const bumpType = process.argv[2] as BumpType | undefined;

  if (!bumpType || !["patch", "minor", "major"].includes(bumpType)) {
    console.error("Usage: bun scripts/publish-cli.ts <patch|minor|major>");
    process.exit(1);
  }

  // Check for uncommitted changes
  const status = await $`git status --porcelain`.text();
  if (status.trim()) {
    console.error("Error: You have uncommitted changes. Please commit or stash them first.");
    process.exit(1);
  }

  // Check we're on main branch
  const branch = await $`git branch --show-current`.text();
  if (branch.trim() !== "main") {
    console.error("Error: You must be on the main branch to publish.");
    process.exit(1);
  }

  // Pull latest
  console.log("Pulling latest changes...");
  await $`git pull --rebase`;

  // Read current version
  const pkg = await Bun.file(PACKAGE_PATH).json();
  const currentVersion = pkg.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

  // Update package.json
  pkg.version = newVersion;
  await Bun.write(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + "\n");

  // Commit the version bump
  const tagName = `cli-v${newVersion}`;
  await $`git add ${PACKAGE_PATH}`;
  await $`git commit -m "cli: Release ${newVersion}"`;

  // Create and push tag
  console.log(`Creating tag: ${tagName}`);
  await $`git tag ${tagName}`;

  console.log("Pushing to origin...");
  await $`git push origin main`;
  await $`git push origin ${tagName}`;

  console.log(`\n✓ Released ${tagName}`);
  console.log(`  View workflow: https://github.com/vibeinsights/vibeinsights/actions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
