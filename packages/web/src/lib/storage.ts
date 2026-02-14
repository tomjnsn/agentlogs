import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_PATH = process.env.STORAGE_PATH || "/data/storage";

/**
 * Local filesystem storage that provides an API compatible with Cloudflare R2.
 * Used as a drop-in replacement for env.BUCKET in self-hosted deployments.
 */
export const storage = {
  async get(key: string): Promise<{ text(): Promise<string>; body: ReadableStream; size: number } | null> {
    const filePath = path.join(STORAGE_PATH, key);
    try {
      const data = await fs.readFile(filePath);
      return {
        async text() {
          return data.toString("utf-8");
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(data));
            controller.close();
          },
        }),
        size: data.length,
      };
    } catch {
      return null;
    }
  },

  async put(
    key: string,
    data: string | ArrayBuffer,
    _options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    const filePath = path.join(STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    await fs.writeFile(filePath, buffer);
  },

  async delete(key: string): Promise<void> {
    const filePath = path.join(STORAGE_PATH, key);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file not found
    }
  },

  async head(key: string): Promise<{ size: number } | null> {
    const filePath = path.join(STORAGE_PATH, key);
    try {
      const stat = await fs.stat(filePath);
      return { size: stat.size };
    } catch {
      return null;
    }
  },
};
