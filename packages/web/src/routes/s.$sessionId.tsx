import { createFileRoute, redirect } from "@tanstack/react-router";
import { getTranscriptBySessionId } from "../lib/server-functions";

export const Route = createFileRoute("/s/$sessionId")({
  loader: async ({ params }) => {
    const transcript = await getTranscriptBySessionId({ data: params.sessionId });

    throw redirect({
      to: "/transcripts/$id",
      params: {
        id: transcript.id,
      },
    });
  },
  component: () => null,
});
