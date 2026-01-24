import { uploadCommand } from "../../lib/upload-jsonl";

export async function codexUploadCommand(transcript: string): Promise<void> {
  await uploadCommand(transcript, "codex");
}
