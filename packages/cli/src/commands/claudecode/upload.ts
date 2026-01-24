import { uploadCommand } from "../../lib/upload-jsonl";

export async function claudeCodeUploadCommand(transcript: string): Promise<void> {
  await uploadCommand(transcript, "claude-code");
}
