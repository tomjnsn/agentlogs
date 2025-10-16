import path from "node:path";
import { convertClaudeCodeFile } from "@vibeinsights/shared/claudecode";
import { describe, expect, test } from "bun:test";
import { analyzeTranscript } from "./analyzer";

const FIXTURE_DIR = path.resolve(import.meta.dir, "../../../../fixtures/claudecode");

describe("analyzeTranscript (temporary log)", () => {
  test("crud demo", async () => {
    const transcript = await convertClaudeCodeFile(path.join(FIXTURE_DIR, "crud.jsonl"));
    expect(transcript).not.toBeNull();

    const analysis = analyzeTranscript(transcript!);
    expect(analysis).toMatchInlineSnapshot(`
      {
        "antiPatterns": [],
        "healthScore": 100,
        "metrics": {
          "contextOverflows": 0,
          "duration": 46061,
          "errors": 0,
          "retries": 0,
          "toolCalls": 9,
          "totalEvents": 16,
        },
        "recommendations": [
          "Large token usage detected; evaluate opportunities to trim prompts or leverage caching.",
        ],
        "transcriptId": "8122657c-fe54-4dc9-89a3-20049e8a84f7",
      }
    `);
  });
});
