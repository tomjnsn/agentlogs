import { StatCard } from "@/components/stat-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { TranscriptEvent } from "@vibeinsights/shared";
import { getTranscript } from "../lib/server-functions";

export const Route = createFileRoute("/transcripts/$id")({
  loader: ({ params }) => getTranscript({ data: params.id }),
  component: TranscriptDetailComponent,
});

type AntiPattern = {
  severity: "low" | "medium" | "high";
  description: string;
  type?: string;
};

function TranscriptDetailComponent() {
  const transcript = Route.useLoaderData();
  const analysis = transcript.analysis;
  const antiPatterns = (analysis?.antiPatterns ?? []) as AntiPattern[];
  const recommendations = (analysis?.recommendations ?? []) as string[];
  const severityVariantMap: Record<AntiPattern["severity"], BadgeProps["variant"]> = {
    high: "destructive",
    medium: "secondary",
    low: "outline",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/repos/$id" params={{ id: transcript.repoId }}>
            ← Back to Repository
          </Link>
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">Transcript</h2>
      </div>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <StatCard label="Health Score" value={`${analysis.healthScore}%`} />
              <StatCard label="Retries" value={analysis.retryCount} />
              <StatCard label="Errors" value={analysis.errorCount} />
              <StatCard label="Failure Rate" value={`${(analysis.toolFailureRate * 100).toFixed(1)}%`} />
            </div>

            {antiPatterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Anti-Patterns</h4>
                <ul className="space-y-2">
                  {antiPatterns.map((antiPattern, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Badge variant={severityVariantMap[antiPattern.severity]}>{antiPattern.severity}</Badge>
                      <span className="text-muted-foreground text-sm">{antiPattern.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recommendations</h4>
                <ul className="list-inside list-disc space-y-1">
                  {recommendations.map((recommendation, index) => (
                    <li key={index} className="text-muted-foreground text-sm">
                      {recommendation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Events</h3>
        {transcript.events.map((event: TranscriptEvent, i: number) => (
          <EventCard key={i} event={event} index={i} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event, index }: { event: TranscriptEvent; index: number }) {
  return (
    <Card
      className={cn(
        "border-l-4",
        event.type === "user" && "border-l-blue-500 bg-blue-50/50",
        event.type === "assistant" && "border-l-green-500 bg-green-50/50",
        event.type === "tool_use" && "border-l-purple-500 bg-purple-50/50",
        event.type === "tool_result" && event.error
          ? "border-l-red-500 bg-red-50/50"
          : "border-l-gray-500 bg-gray-50/50",
      )}
    >
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <Badge variant="outline">
            #{index + 1} {event.type}
          </Badge>
          <span className="text-muted-foreground text-xs">{new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>

        {event.type === "user" && (
          <pre className="bg-background/50 whitespace-pre-wrap rounded border p-3 text-sm">
            {typeof event.message.content === "string"
              ? event.message.content
              : JSON.stringify(event.message.content, null, 2)}
          </pre>
        )}

        {event.type === "assistant" && (
          <div className="bg-background/50 whitespace-pre-wrap rounded border p-3 text-sm">
            {event.message.content.map((c) => c.text || "").join("")}
          </div>
        )}

        {event.type === "tool_use" && (
          <>
            <div className="mb-2 text-sm font-medium">Tool: {event.tool_name}</div>
            <pre className="bg-background/50 overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          </>
        )}

        {event.type === "tool_result" && (
          <>
            <div className="mb-2 text-sm font-medium">Result: {event.tool_name}</div>
            {event.error ? (
              <div className="text-destructive bg-background/50 rounded border p-3 text-sm">Error: {event.error}</div>
            ) : (
              <pre className="bg-background/50 overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
                {JSON.stringify(event.tool_response, null, 2)}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
