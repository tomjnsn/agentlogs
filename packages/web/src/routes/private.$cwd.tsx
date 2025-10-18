import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getTranscriptsByCwd } from "../lib/server-functions";

type PrivateTranscripts = Awaited<ReturnType<typeof getTranscriptsByCwd>>;

export const Route = createFileRoute("/private/$cwd")({
  loader: ({ params }) => getTranscriptsByCwd({ data: params.cwd }),
  component: PrivateDetailComponent,
});

function PrivateDetailComponent() {
  const transcripts = Route.useLoaderData() as PrivateTranscripts;
  const { cwd } = Route.useParams();
  const formatSource = (source: PrivateTranscripts[number]["source"]) => {
    switch (source) {
      case "claude-code":
        return "Claude Code";
      case "codex":
        return "Codex";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">← Back to Dashboard</Link>
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">Private Transcripts: {decodeURIComponent(cwd)}</h2>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transcript ID</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Conversation Date</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transcripts.map((transcript) => (
                <TableRow key={transcript.id}>
                  <TableCell>
                    <code className="font-mono text-sm">{transcript.transcriptId?.slice(0, 8) || "N/A"}...</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatSource(transcript.source)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
                    {transcript.preview || "No preview"}
                  </TableCell>
                  <TableCell>{transcript.messageCount ?? "N/A"}</TableCell>
                  <TableCell>${transcript.costUsd?.toFixed(4) ?? "0.0000"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(transcript.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(transcript.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/transcripts/$id" params={{ id: transcript.id }}>
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
