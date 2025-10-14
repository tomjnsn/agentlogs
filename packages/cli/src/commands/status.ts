import { authClient } from "../auth";
import { getToken, readConfig } from "../config";
import { NODE_ENV } from "../env-config";

/**
 * Get the effective server URL being used
 */
function getEffectiveServerURL(): string {
  return process.env.SERVER_URL ?? "http://localhost:3000";
}

export async function statusCommand(): Promise<void> {
  const token = getToken();

  if (!token) {
    console.log("❌ Not logged in");
    console.log("Run `bun run src/index.ts login` to authenticate");
    process.exit(1);
  }

  // Verify token by getting session
  try {
    const { data: session, error } = await authClient.getSession({
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    if (error || !session?.user) {
      console.log("❌ Not logged in (token invalid or expired)");
      console.log("Run `bun run src/index.ts login` to authenticate");
      process.exit(1);
    }

    const config = readConfig();
    const serverUrl = getEffectiveServerURL();

    console.log("✅ Logged in");
    console.log(`👤 Name: ${session.user.name}`);
    console.log(`📧 Email: ${session.user.email}`);
    console.log(`🌐 Server: ${serverUrl}`);
    console.log(`🔧 Environment: ${NODE_ENV}`);
    if (config.lastLoginTime) {
      const lastLogin = new Date(config.lastLoginTime);
      console.log(`🕐 Last login: ${lastLogin.toLocaleString()}`);
    }
  } catch (err) {
    console.error("❌ Error verifying session:", err instanceof Error ? err.message : "Unknown error");
    console.log("Run `bun run src/index.ts login` to authenticate");
    process.exit(1);
  }
}
