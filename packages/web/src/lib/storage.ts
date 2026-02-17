import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_PATH = process.env.STORAGE_PATH || "/data/storage";

function createS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

const s3Storage = {
  async get(key: string): Promise<{ text(): Promise<string>; body: ReadableStream; size: number } | null> {
    const client = createS3Client();
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      const stream = response.Body!.transformToWebStream();
      const size = response.ContentLength ?? 0;
      return {
        async text() {
          const res = await new Response(stream).text();
          return res;
        },
        body: stream as ReadableStream,
        size,
      };
    } catch (e: any) {
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },

  async put(key: string, data: string | ArrayBuffer, _options?: { httpMetadata?: { contentType?: string } }) {
    const client = createS3Client();
    const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: _options?.httpMetadata?.contentType,
      }),
    );
  },

  async delete(key: string) {
    const client = createS3Client();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    } catch {
      // Ignore errors on delete
    }
  },

  async head(key: string): Promise<{ size: number } | null> {
    const client = createS3Client();
    try {
      const response = await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return { size: response.ContentLength ?? 0 };
    } catch (e: any) {
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },
};

const localStorage = {
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

export const storage = process.env.S3_BUCKET ? s3Storage : localStorage;
