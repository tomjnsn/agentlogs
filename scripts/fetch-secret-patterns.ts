#!/usr/bin/env bun
/**
 * Fetches secret patterns from secrets-patterns-db and converts to TypeScript
 * Run with: bun scripts/fetch-secret-patterns.ts
 */

import { parse } from "yaml";
import { writeFileSync } from "fs";
import { join } from "path";

const YAML_URL = "https://raw.githubusercontent.com/mazen160/secrets-patterns-db/master/db/rules-stable.yml";
const OUTPUT_PATH = join(import.meta.dirname, "../packages/shared/src/secret-patterns.ts");

interface YamlPattern {
  pattern: {
    name: string;
    regex: string;
    confidence: "low" | "high";
  };
}

interface YamlRoot {
  patterns: YamlPattern[];
}

// Additional patterns from https://blogs.jsmon.sh/100-regex-patterns/
// and https://github.com/h33tlit/secret-regex-list
const CUSTOM_PATTERNS: Array<{ name: string; regex: string }> = [
  // AI Providers (not in secrets-patterns-db)
  { name: "OpenAI API Key", regex: "sk-[a-zA-Z0-9]{20,}" },
  { name: "OpenAI Project Key", regex: "sk-proj-[a-zA-Z0-9\\-_]{20,}" },
  { name: "Anthropic API Key", regex: "sk-ant-[a-zA-Z0-9\\-_]{20,}" },
  { name: "Cohere API Key", regex: "co-[a-zA-Z0-9]{40,}" },
  { name: "HuggingFace Token", regex: "hf_[a-zA-Z0-9]{34,}" },
  { name: "Replicate API Token", regex: "r8_[a-zA-Z0-9]{40}" },

  // JWT & OAuth
  { name: "JWT Token", regex: "eyJ[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_.+/=]*" },
  { name: "OAuth Client Secret", regex: "(?i)client_secret['\"\\s:=]+[a-zA-Z0-9\\-_.~]{10,100}" },
  { name: "OAuth Client ID", regex: "(?i)client_id['\"\\s:=]+[a-zA-Z0-9\\-_.~]{10,100}" },
  { name: "Bearer Token", regex: "Bearer\\s+[a-zA-Z0-9\\-._~+/]+=*" },
  { name: "Authorization Bearer", regex: "(?i)authorization:\\s*Bearer\\s+[a-zA-Z0-9\\-._~+/]+=*" },
  { name: "Google OAuth Access Token", regex: "ya29\\.[0-9A-Za-z\\-_]+" },

  // GitHub (extended)
  { name: "GitHub Fine-Grained Token", regex: "github_pat_[0-9a-zA-Z_]{20,}" },
  { name: "GitHub OAuth App Secret", regex: "[g|G][i|I][t|T][h|H][u|U][b|B].*['|\"][0-9a-zA-Z]{35,40}['|\"]" },
  { name: "GitLab PAT", regex: "glpat-[a-zA-Z0-9_-]{16,}" },
  { name: "GitLab Runner Token", regex: "glrt-[a-zA-Z0-9_-]{16,}" },

  // Database URIs
  { name: "MongoDB URI", regex: "mongodb(\\+srv)?:\\/\\/[^\\s'\"]+" },
  { name: "PostgreSQL URI", regex: "postgres(?:ql)?:\\/\\/[^\\s'\"]+" },
  { name: "MySQL URI", regex: "mysql:\\/\\/[^\\s'\"]+" },
  { name: "Redis URI", regex: "redis:\\/\\/[^\\s'\"]+" },
  { name: "JDBC URL", regex: "jdbc:\\w+:\\/\\/[^\\s'\"]+" },
  { name: "Password in URL", regex: "[a-zA-Z]{3,10}://[^/\\s:@]{3,20}:[^/\\s:@]{3,20}@.{1,100}[\"'\\s]" },

  // Cloud & DevOps
  { name: "DigitalOcean Token", regex: "dop_v1_[a-z0-9]{64}" },
  { name: "Vault Token", regex: "s\\.[a-zA-Z0-9]{8,}" },
  { name: "CircleCI Token", regex: "circle-token=[a-z0-9]{40}" },
  { name: "New Relic Key", regex: "NRII-[a-zA-Z0-9]{20,}" },
  { name: "Sentry DSN", regex: "https:\\/\\/[a-zA-Z0-9]+@[a-z]+\\.ingest\\.sentry\\.io\\/\\d+" },
  { name: "Cloudinary URL", regex: "cloudinary:\\/\\/[0-9]{15}:[a-zA-Z0-9]+@[a-zA-Z]+" },

  // Messaging & Social
  { name: "Discord Bot Token", regex: "[MN][A-Za-z\\d]{23}\\.[\\w-]{6}\\.[\\w-]{27}" },
  { name: "Discord Webhook", regex: "https:\\/\\/discord(?:app)?\\.com\\/api\\/webhooks\\/[0-9]+\\/[a-zA-Z0-9_-]+" },
  { name: "Telegram Bot Token", regex: "\\d{9}:[a-zA-Z0-9_-]{35}" },
  {
    name: "Microsoft Teams Webhook",
    regex: "https:\\/\\/[a-z]+\\.webhook\\.office\\.com\\/webhookb2\\/[a-zA-Z0-9@\\-]+\\/.*",
  },

  // Payment
  { name: "Stripe Publishable Key", regex: "pk_live_[0-9a-zA-Z]{24}" },
  { name: "PayPal Braintree Token", regex: "access_token\\$production\\$[0-9a-z]{16}\\$[0-9a-f]{32}" },
  { name: "Square Access Token", regex: "sq0atp-[0-9A-Za-z\\-_]{22}" },
  { name: "Square OAuth Secret", regex: "sq0csp-[0-9A-Za-z\\-_]{43}" },

  // Services
  { name: "SendGrid API Key", regex: "SG\\.[\\w\\d\\-_]{22}\\.[\\w\\d\\-_]{43}" },
  { name: "Mailgun API Key", regex: "key-[0-9a-zA-Z]{32}" },
  { name: "MailChimp API Key", regex: "[0-9a-f]{32}-us[0-9]{1,2}" },
  { name: "Shopify Access Token", regex: "shpat_[0-9a-fA-F]{32}" },
  { name: "Dropbox Access Token", regex: "sl\\.[A-Za-z0-9_-]{20,100}" },
  { name: "Asana Token", regex: "0\\/[0-9a-z]{32}" },
  { name: "Linear API Key", regex: "lin_api_[a-zA-Z0-9]{40}" },
  {
    name: "Riot Games API Key",
    regex: "RGAPI-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
  },

  // Generic patterns
  { name: "Generic API Key", regex: "(?i)(api[_-]?key)['\"\\s:=]+[a-zA-Z0-9\\-_.]{16,}" },
  { name: "Generic Secret", regex: "(?i)(secret|password|passwd|pwd)['\"\\s:=]+[^\\s'\"]{8,}" },
  { name: "Generic Token", regex: "(?i)(token)['\"\\s:=]+[a-zA-Z0-9\\-_.]{16,}" },
  { name: "Private Key Block", regex: "-----BEGIN (RSA|DSA|EC|OPENSSH|PGP)?\\s*PRIVATE\\s+KEY" },
  { name: "Certificate Block", regex: "-----BEGIN CERTIFICATE-----" },
];

async function main() {
  console.log("Fetching patterns from secrets-patterns-db...");
  const response = await fetch(YAML_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const yamlContent = await response.text();
  const parsed = parse(yamlContent) as YamlRoot;

  console.log(`Parsed ${parsed.patterns.length} patterns from secrets-patterns-db`);

  // Convert to simpler structure (drop confidence)
  const dbPatterns = parsed.patterns.map(({ pattern }) => ({
    name: pattern.name,
    regex: pattern.regex,
  }));

  // Merge, putting custom patterns first (they're more specific/modern)
  const allPatterns = [...CUSTOM_PATTERNS, ...dbPatterns];

  // Dedupe by name (keep first occurrence, i.e. custom patterns win)
  const seen = new Set<string>();
  const uniquePatterns = allPatterns.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Added ${CUSTOM_PATTERNS.length} custom patterns`);
  console.log(`Total: ${uniquePatterns.length} unique patterns`);

  // Generate TypeScript file
  const tsContent = `// Auto-generated from secrets-patterns-db + custom patterns
// Source: ${YAML_URL}
// Custom patterns from: https://blogs.jsmon.sh/100-regex-patterns/
// Generated: ${new Date().toISOString()}
// Total patterns: ${uniquePatterns.length}

export interface SecretPattern {
  name: string
  regex: string
}

export const SECRET_PATTERNS: SecretPattern[] = ${JSON.stringify(uniquePatterns, null, 2)}
`;

  writeFileSync(OUTPUT_PATH, tsContent);
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
