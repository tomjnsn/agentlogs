import { StatCard } from "@/components/stat-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { UnifiedTranscriptMessage } from "@vibeinsights/shared/claudecode";
import { unifiedTranscriptSchema } from "@vibeinsights/shared/schemas";
import { getToolSummary } from "../lib/message-utils";
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
  const data = Route.useLoaderData();
  const analysis = data.analysis;
  const antiPatterns = (analysis?.antiPatterns ?? []) as AntiPattern[];
  const recommendations = (analysis?.recommendations ?? []) as string[];
  const severityVariantMap: Record<AntiPattern["severity"], BadgeProps["variant"]> = {
    high: "destructive",
    medium: "secondary",
    low: "outline",
  };

  // Parse and validate the unified transcript
  const unifiedTranscript = unifiedTranscriptSchema.parse(data.unifiedTranscript);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/repos/$id" params={{ id: data.repoId }}>
            ← Back to Repository
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Transcript</h2>
          <div className="text-muted-foreground text-sm">
            {unifiedTranscript.messageCount} messages • ${unifiedTranscript.costUsd.toFixed(4)}
          </div>
        </div>
        {unifiedTranscript.preview && <p className="text-muted-foreground text-sm">{unifiedTranscript.preview}</p>}
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
        <h3 className="text-lg font-semibold">Messages</h3>
        {unifiedTranscript.messages.map((message, i) => (
          <MessageCard key={i} message={message} index={i} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ message, index }: { message: UnifiedTranscriptMessage; index: number }) {
  const shouldCollapse = message.type === "tool-call" || message.type === "thinking";

  const getTypeColor = () => {
    switch (message.type) {
      case "user":
        return "border-l-blue-500 bg-blue-50/50";
      case "agent":
        return "border-l-green-500 bg-green-50/50";
      case "thinking":
        return "border-l-yellow-500 bg-yellow-50/50";
      case "tool-call":
        return message.error || message.isError
          ? "border-l-red-500 bg-red-50/50"
          : "border-l-purple-500 bg-purple-50/50";
      default:
        return "border-l-gray-500 bg-gray-50/50";
    }
  };

  // For non-collapsible messages (user/agent), render directly
  if (!shouldCollapse) {
    return (
      <Card className={cn("border-l-4", getTypeColor())}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <Badge variant="outline">
              #{index + 1} {message.type}
            </Badge>
            {message.timestamp && (
              <span className="text-muted-foreground text-xs">{new Date(message.timestamp).toLocaleTimeString()}</span>
            )}
          </div>

          {message.type === "user" && (
            <pre className="bg-background/50 whitespace-pre-wrap rounded border p-3 text-sm">{message.text}</pre>
          )}

          {message.type === "agent" && (
            <div className="bg-background/50 whitespace-pre-wrap rounded border p-3 text-sm">{message.text}</div>
          )}
        </CardContent>
      </Card>
    );
  }

  // For collapsible messages (tool-call/thinking), use Collapsible component
  return (
    <Card className={cn("border-l-4", getTypeColor())}>
      <CardContent className="pt-6">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between mb-3 cursor-pointer hover:bg-accent/50 rounded -m-2 p-2 w-full">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  #{index + 1} {message.type}
                </Badge>

                {/* Show summary for collapsed tool calls */}
                {message.type === "tool-call" && (
                  <span className="text-sm">
                    {message.toolName} • {getToolSummary(message)}
                  </span>
                )}

                {/* Show preview for collapsed thinking blocks */}
                {message.type === "thinking" && (
                  <span className="text-sm text-muted-foreground">
                    {message.text.slice(0, 60)}...
                  </span>
                )}
              </div>

              {message.timestamp && (
                <span className="text-muted-foreground text-xs">{new Date(message.timestamp).toLocaleTimeString()}</span>
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            {message.type === "thinking" && (
              <div className="bg-background/50 text-muted-foreground whitespace-pre-wrap rounded border p-3 text-sm italic">
                {message.text}
              </div>
            )}

            {message.type === "tool-call" && (
              <>
                <div className="mb-2 text-sm font-medium">
                  Tool: {message.toolName ?? "Unknown"}
                  {message.isError && (
                    <Badge className="ml-2" variant="destructive">
                      Error
                    </Badge>
                  )}
                </div>
                {message.input && (
                  <div className="mb-2">
                    <div className="text-muted-foreground mb-1 text-xs font-semibold">Input:</div>
                    <pre className="bg-background/50 overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
                      {JSON.stringify(message.input, null, 2)}
                    </pre>
                  </div>
                )}
                {message.output && (
                  <div>
                    <div className="text-muted-foreground mb-1 text-xs font-semibold">Output:</div>
                    <pre className="bg-background/50 overflow-x-auto whitespace-pre-wrap rounded border p-3 text-xs">
                      {JSON.stringify(message.output, null, 2)}
                    </pre>
                  </div>
                )}
                {message.error && (
                  <div className="text-destructive bg-background/50 mt-2 rounded border p-3 text-sm">
                    Error: {message.error}
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
