/**
 * Environment variable access for self-hosted deployment.
 * Replaces Cloudflare Workers `env` bindings with process.env.
 */
export const env = {
  get GITHUB_CLIENT_ID() {
    return process.env.GITHUB_CLIENT_ID ?? "";
  },
  get GITHUB_CLIENT_SECRET() {
    return process.env.GITHUB_CLIENT_SECRET ?? "";
  },
  get BETTER_AUTH_SECRET() {
    return process.env.BETTER_AUTH_SECRET ?? "";
  },
  get WEB_URL() {
    return process.env.WEB_URL ?? "http://localhost:3000";
  },
  get OPENROUTER_API_KEY() {
    return process.env.OPENROUTER_API_KEY ?? "";
  },
  get RESEND_API_KEY() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get S3_ENDPOINT() {
    return process.env.S3_ENDPOINT ?? "";
  },
  get S3_BUCKET() {
    return process.env.S3_BUCKET ?? "";
  },
  get S3_REGION() {
    return process.env.S3_REGION ?? "";
  },
  get S3_ACCESS_KEY() {
    return process.env.S3_ACCESS_KEY ?? "";
  },
  get S3_SECRET_KEY() {
    return process.env.S3_SECRET_KEY ?? "";
  },
};
