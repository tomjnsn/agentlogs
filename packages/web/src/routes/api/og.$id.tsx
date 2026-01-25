import { createDrizzle } from "@/db";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import { getPublicTranscript, getTranscriptWithAccess } from "../../db/queries";
import { createAuth } from "../../lib/auth";
import { logger } from "../../lib/logger";

interface TranscriptData {
  summary: string | null;
  preview: string;
  userName: string | null;
  userImage: string | null;
  source: string;
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  model?: string | null;
}

function getModelDisplayName(model: string | null | undefined): string {
  if (!model) return "";

  const match = model.match(/^claude-(?:(\d+)-(\d+)-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d+))?)?-\d{8}$/);
  if (!match) return model;

  const [, oldMajor, oldMinor, family, newMajor, newMinor] = match;
  const major = newMajor ?? oldMajor;
  const minor = newMinor ?? oldMinor;
  const version = minor ? `${major}.${minor}` : major;
  const familyName = family.charAt(0).toUpperCase() + family.slice(1);

  return `Claude ${familyName} ${version}`;
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "opencode":
      return "OpenCode";
    default:
      return source;
  }
}

function OgImage({ data }: { data: TranscriptData }) {
  const title = data.summary || data.preview || "Untitled Thread";
  const hasChanges = data.linesAdded > 0 || data.linesRemoved > 0 || data.linesModified > 0;
  const modelName = getModelDisplayName(data.model);
  const sourceLabel = getSourceLabel(data.source);

  // Truncate title if too long
  const maxTitleLength = 80;
  const displayTitle = title.length > maxTitleLength ? title.slice(0, maxTitleLength) + "..." : title;

  // Truncate preview for description
  const maxPreviewLength = 120;
  const displayPreview =
    data.preview && data.preview !== title
      ? data.preview.length > maxPreviewLength
        ? data.preview.slice(0, maxPreviewLength) + "..."
        : data.preview
      : null;

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "60px",
        background: "linear-gradient(135deg, #0a0a0a 0%, #18181b 50%, #1f1f23 100%)",
        fontFamily: "Inter, sans-serif",
        color: "#fafafa",
      }}
    >
      {/* Top section - source badge and model */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {/* Source badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            background: "rgba(99, 102, 241, 0.15)",
            borderRadius: "9999px",
            border: "1px solid rgba(99, 102, 241, 0.3)",
          }}
        >
          <span
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#a5b4fc",
            }}
          >
            {sourceLabel}
          </span>
        </div>
        {/* Model name */}
        {modelName && (
          <span
            style={{
              fontSize: "18px",
              color: "#71717a",
            }}
          >
            {modelName}
          </span>
        )}
      </div>

      {/* Main title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <h1
          style={{
            fontSize: "56px",
            fontFamily: "Georgia, serif",
            fontWeight: 400,
            lineHeight: 1.2,
            margin: 0,
            color: "#fafafa",
            letterSpacing: "0.02em",
          }}
        >
          {displayTitle}
        </h1>
        {/* Preview text */}
        {displayPreview && (
          <p
            style={{
              fontSize: "24px",
              color: "#a1a1aa",
              marginTop: "24px",
              lineHeight: 1.5,
            }}
          >
            {displayPreview}
          </p>
        )}
      </div>

      {/* Bottom section - stats and branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        {/* Left side - author and stats */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
          }}
        >
          {/* Author info */}
          {data.userName && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {data.userImage && (
                <img
                  src={data.userImage}
                  width={40}
                  height={40}
                  style={{
                    borderRadius: "9999px",
                  }}
                />
              )}
              <span
                style={{
                  fontSize: "20px",
                  color: "#a1a1aa",
                }}
              >
                {data.userName}
              </span>
            </div>
          )}
          {/* Stats */}
          {hasChanges && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                fontSize: "20px",
              }}
            >
              {data.linesAdded > 0 && <span style={{ color: "#22c55e" }}>+{data.linesAdded}</span>}
              {data.linesModified > 0 && <span style={{ color: "#eab308" }}>~{data.linesModified}</span>}
              {data.linesRemoved > 0 && <span style={{ color: "#f87171" }}>-{data.linesRemoved}</span>}
            </div>
          )}
        </div>

        {/* Right side - AgentLogs branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Logo circle */}
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "white",
              }}
            >
              A
            </span>
          </div>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "#fafafa",
            }}
          >
            AgentLogs
          </span>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute("/api/og/$id" as any)({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const { id } = params;
        logger.debug("OG image request received", { id });

        try {
          const db = createDrizzle(env.DB);
          const auth = createAuth();

          // Try to get session for authenticated access
          const session = await auth.api.getSession({
            headers: request.headers,
          });

          let transcript;
          if (session?.user) {
            logger.debug("Fetching transcript with auth", { userId: session.user.id, id });
            transcript = await getTranscriptWithAccess(db, session.user.id, id);
          } else {
            logger.debug("Fetching public transcript", { id });
            transcript = await getPublicTranscript(db, id);
          }

          if (!transcript) {
            logger.debug("Transcript not found, using placeholder", { id, hasSession: !!session?.user });
            // For OG images, use placeholder data if transcript not accessible
            // This allows social media previews without exposing private content
            const placeholderData: TranscriptData = {
              summary: "Agent Transcript",
              preview: "View this AI agent transcript on AgentLogs",
              userName: null,
              userImage: null,
              source: "claude-code",
              linesAdded: 0,
              linesRemoved: 0,
              linesModified: 0,
              model: null,
            };

            return new ImageResponse(<OgImage data={placeholderData} />, {
              width: 1200,
              height: 630,
              format: "png",
            });
          }

          logger.debug("Transcript found", { id, summary: transcript.summary?.slice(0, 50) });

          const data: TranscriptData = {
            summary: transcript.summary,
            preview: transcript.preview ?? "",
            userName: transcript.userName,
            userImage: transcript.userImage,
            source: transcript.source,
            linesAdded: transcript.linesAdded ?? 0,
            linesRemoved: transcript.linesRemoved ?? 0,
            linesModified: transcript.linesModified ?? 0,
            model: transcript.model,
          };

          return new ImageResponse(<OgImage data={data} />, {
            width: 1200,
            height: 630,
            format: "png",
          });
        } catch (error) {
          logger.error("OG image generation failed", {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
