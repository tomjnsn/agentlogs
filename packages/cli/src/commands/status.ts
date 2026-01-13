import { createAuthClientForEnv } from "../auth";
import { getEnvironments, getTokenForEnv } from "../config";

export async function statusCommand(): Promise<void> {
  const environments = getEnvironments();

  if (environments.length === 0) {
    console.log("❌ Not logged in");
    console.log("Run `agentlogs login` to authenticate");
    process.exit(1);
  }

  console.log("🔐 AgentLogs Authentication Status\n");

  let hasValidAuth = false;

  for (const env of environments) {
    const token = getTokenForEnv(env.name);
    const envLabel = env.name === "dev" ? "Development" : "Production";

    if (!token) {
      console.log(`${envLabel} (${env.baseURL})`);
      console.log(`  ❌ Token not found in keychain`);
      console.log(`  📧 Was: ${env.user.email}`);
      console.log("");
      continue;
    }

    // Verify token by getting session
    try {
      const authClient = createAuthClientForEnv(env.baseURL);
      const { data: session, error } = await authClient.getSession({
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      if (error || !session?.user) {
        console.log(`${envLabel} (${env.baseURL})`);
        console.log(`  ⚠️  Token invalid or expired`);
        console.log(`  📧 Was: ${env.user.email}`);
        console.log(`  Run \`agentlogs login${env.name === "dev" ? " --dev" : ""}\` to re-authenticate`);
        console.log("");
        continue;
      }

      hasValidAuth = true;
      console.log(`${envLabel} (${env.baseURL})`);
      console.log(`  ✅ Logged in`);
      console.log(`  👤 ${session.user.name}`);
      console.log(`  📧 ${session.user.email}`);
      if (env.lastLoginTime) {
        const lastLogin = new Date(env.lastLoginTime);
        console.log(`  🕐 Last login: ${lastLogin.toLocaleString()}`);
      }
      console.log("");
    } catch (err) {
      console.log(`${envLabel} (${env.baseURL})`);
      console.log(`  ❌ Error verifying session: ${err instanceof Error ? err.message : "Unknown error"}`);
      console.log("");
    }
  }

  if (!hasValidAuth) {
    process.exit(1);
  }
}
