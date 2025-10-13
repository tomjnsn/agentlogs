import open from "open";
import { authClient } from "../auth";
import { readConfig, setToken, writeConfig } from "../config";

export async function loginCommand(): Promise<void> {
  console.log("🔐 VibeInsights Device Authorization");
  console.log("⏳ Requesting device authorization...");

  try {
    // Request device code
    const { data, error } = await authClient.device.code({
      client_id: "vibeinsights-cli",
      scope: "openid profile email",
    });

    if (error || !data) {
      console.error("❌ Error:", error?.error_description || "Failed to request device code");
      process.exit(1);
    }

    const { device_code, user_code, verification_uri, verification_uri_complete, interval = 5 } = data;

    console.log("\n📱 Device Authorization in Progress");
    console.log(`Please visit: ${verification_uri}`);
    console.log(`Enter code: ${user_code}\n`);

    // Open browser with the complete URL
    const urlToOpen = verification_uri_complete || verification_uri;
    if (urlToOpen) {
      console.log("🌐 Opening browser...");
      await open(urlToOpen);
    }

    console.log(`⏳ Waiting for authorization... (polling every ${interval}s)`);

    // Poll for token
    await pollForToken(device_code, interval);
  } catch (err) {
    console.error("❌ Error:", err instanceof Error ? err.message : "Unknown error");
    process.exit(1);
  }
}

async function pollForToken(deviceCode: string, interval: number): Promise<void> {
  let pollingInterval = interval;

  return new Promise<void>((resolve) => {
    const poll = async () => {
      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: "vibeinsights-cli",
        });

        if (data?.access_token) {
          console.log("\n✅ Authorization Successful!");
          console.log("🔑 Access token received!");

          // Get user session with Bearer token
          const { data: session } = await authClient.getSession({
            fetchOptions: {
              headers: {
                Authorization: `Bearer ${data.access_token}`,
              },
            },
          });

          if (session?.user) {
            // Store token in keyring
            setToken(session.user.email, data.access_token);

            // Store user info in config
            const config = readConfig();
            writeConfig({
              ...config,
              user: {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
              },
              lastLoginTime: new Date().toISOString(),
            });

            console.log(`👋 Hello, ${session.user.name}!`);
            console.log(`📧 Logged in as: ${session.user.email}`);
          } else {
            console.log("⚠️  Warning: Could not retrieve user session");
          }

          resolve();
          process.exit(0);
        } else if (error) {
          switch (error.error) {
            case "authorization_pending":
              // Continue polling silently
              break;
            case "slow_down":
              pollingInterval += 5;
              console.log(`⚠️  Slowing down polling to ${pollingInterval}s`);
              break;
            case "access_denied":
              console.error("❌ Access was denied by the user");
              process.exit(1);
              break;
            case "expired_token":
              console.error("❌ The device code has expired. Please try again.");
              process.exit(1);
              break;
            default:
              console.error("❌ Error:", error.error_description || error.error);
              process.exit(1);
          }
        }
      } catch (err) {
        console.error("❌ Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }

      // Schedule next poll
      setTimeout(poll, pollingInterval * 1000);
    };

    // Start polling
    setTimeout(poll, pollingInterval * 1000);
  });
}
