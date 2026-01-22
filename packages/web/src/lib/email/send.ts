import { getResendClient } from "./client";
import { WelcomePreviewEmail } from "./templates/welcome-preview";
import { logger } from "../logger";

const FROM_EMAIL = "Philipp from AgentLogs <philipp@agentlogs.ai>";

export async function sendWelcomePreviewEmail(to: string, name: string): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to the AgentLogs Preview",
      react: WelcomePreviewEmail({ name }),
    });

    if (error) {
      logger.error("Failed to send welcome email", { to, error });
      return { success: false, error: error.message };
    }

    logger.info("Welcome email sent", { to });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Exception sending welcome email", { to, error: message });
    return { success: false, error: message };
  }
}
