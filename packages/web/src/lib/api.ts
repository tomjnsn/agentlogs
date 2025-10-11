import type { RepoView, TranscriptView, TranscriptEvent, Analysis } from '@aei/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

/**
 * Wrapper for API calls that includes credentials (session cookies)
 */
async function apiFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Send session cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized - please sign in');
    }
    throw new Error(`API error: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRepos(): Promise<RepoView[]> {
  const data = await apiFetch('/api/repos');
  return data.repos;
}

export async function fetchTranscripts(repoId: string): Promise<TranscriptView[]> {
  const data = await apiFetch(`/api/repos/${encodeURIComponent(repoId)}/transcripts`);
  return data.transcripts;
}

export interface TranscriptDetail {
  transcript: {
    id: string;
    repoId: string;
    sessionId: string;
    events: TranscriptEvent[];
    createdAt: string;
  };
  analysis: {
    healthScore: number;
    antiPatterns: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    recommendations: string[];
    metrics: {
      retries: number;
      errors: number;
      toolFailureRate: number;
      contextOverflows: number;
    };
  } | null;
}

export async function fetchTranscript(id: string): Promise<TranscriptDetail> {
  return apiFetch(`/api/transcripts/${id}`);
}
