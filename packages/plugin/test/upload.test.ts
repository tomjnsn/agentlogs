import { test, expect } from 'bun:test';
import { getRepoMetadata } from '../src/upload';

// Test the only business logic in plugin: repo metadata extraction
// The hook itself is just I/O glue - tested via smoke test

test('getRepoMetadata extracts repo name from git remote', () => {
  // Assumes test runs in a git repo
  const meta = getRepoMetadata(process.cwd());

  expect(meta.repoId).toBeTruthy();
  expect(meta.repoName).toBeTruthy();
  expect(meta.repoName).not.toBe('unknown');
});

test('getRepoMetadata falls back gracefully for non-git dirs', () => {
  const meta = getRepoMetadata('/tmp');

  expect(meta.repoId).toMatch(/^file:\/\//);
  expect(meta.repoName).toBe('tmp');
});
