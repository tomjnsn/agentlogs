import type { UploadPayload, UploadResponse, TranscriptEvent } from '@vibeinsights/shared';
import { execSync } from 'child_process';

// Configuration from environment
const SERVER_URL = process.env.VI_SERVER_URL || 'http://localhost:8787';
const API_TOKEN = process.env.VI_API_TOKEN || 'dev_token';
const TIMEOUT_MS = 10000; // 10 second timeout

/**
 * Upload transcript to Vibe Insights server
 * Returns success status and optional transcript ID
 */
export async function uploadTranscript(
  payload: UploadPayload
): Promise<{ success: boolean; transcriptId?: string }> {
  try {
    const response = await fetch(`${SERVER_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const result: UploadResponse = await response.json();
      return {
        success: true,
        transcriptId: result.transcriptId
      };
    }

    console.error(`Upload failed: ${response.status} ${response.statusText}`);
    return { success: false };
  } catch (error) {
    if (error instanceof Error) {
      console.error('Upload error:', error.message);
    }
    return { success: false };
  }
}

/**
 * Get repository metadata from git
 * Falls back to local path if not a git repo
 */
export function getRepoMetadata(cwd: string): {
  repoId: string;
  repoName: string;
} {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
    }).trim();

    const repoName = remoteUrl.split('/').pop()?.replace('.git', '') || 'unknown';

    return {
      repoId: remoteUrl,
      repoName,
    };
  } catch {
    // Not a git repo or git command failed
    const repoName = cwd.split('/').pop() || 'unknown';
    return {
      repoId: `file://${cwd}`,
      repoName,
    };
  }
}
