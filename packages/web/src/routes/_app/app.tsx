import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getPrivateTranscriptsByCwd, getRepos } from "../../lib/server-functions";

export const Route = createFileRoute("/_app/app")({
  loader: async () => {
    try {
      const [repos, privateTranscripts] = await Promise.all([getRepos(), getPrivateTranscriptsByCwd()]);
      return { repos, privateTranscripts };
    } catch (error) {
      console.error("Failed to load data:", error);
      throw error;
    }
  },
  component: HomeComponent,
  errorComponent: ErrorComponent,
});

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-2xl font-bold text-red-600">Error</h2>
      <p className="mt-2 text-gray-600">{error.message}</p>
      {error.message.includes("Unauthorized") && (
        <p className="mt-4 text-sm text-gray-500">Please sign in with GitHub using the button in the header.</p>
      )}
    </div>
  );
}

function HomeComponent() {
  const { repos, privateTranscripts } = Route.useLoaderData();
  const router = useRouter();
  const [isClearing, setIsClearing] = useState(false);

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete ALL transcripts? This action cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      const response = await fetch("/api/transcripts/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to clear transcripts");
      }

      const data = (await response.json()) as {
        success: boolean;
        deletedCount: number;
      };
      alert(`Successfully deleted ${data.deletedCount} transcripts`);

      // Reload the page to refresh the data
      router.invalidate();
    } catch (error) {
      alert("Failed to clear transcripts: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Repositories</h2>
        <Button variant="destructive" size="sm" onClick={handleClearAll} disabled={isClearing}>
          {isClearing ? "Clearing..." : "Clear All Transcripts"}
        </Button>
      </div>

      {repos.length === 0 && privateTranscripts.length === 0 ? (
        <p className="text-muted-foreground">No repositories or transcripts yet. Start capturing transcripts!</p>
      ) : (
        <>
          {repos.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Transcripts</TableHead>
                      <TableHead>Avg Health</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repos.map((repo: (typeof repos)[0]) => (
                      <TableRow key={repo.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{repo.repo}</div>
                            <div className="text-sm text-muted-foreground">{repo.id}</div>
                          </div>
                        </TableCell>
                        <TableCell>{repo.transcriptCount}</TableCell>
                        <TableCell>N/A</TableCell>
                        <TableCell className="text-muted-foreground">
                          {repo.lastActivity ? new Date(repo.lastActivity).toLocaleString() : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to="/repos/$id" params={{ id: repo.id }}>
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
          )}

          {privateTranscripts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Private Transcripts</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Directory</TableHead>
                        <TableHead>Transcripts</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {privateTranscripts.map((item: (typeof privateTranscripts)[0]) => (
                        <TableRow key={item.cwd}>
                          <TableCell>
                            <div className="font-medium">{item.cwd || "(unknown)"}</div>
                          </TableCell>
                          <TableCell>{item.transcriptCount}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to="/private/$cwd" params={{ cwd: item.cwd || "" }}>
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
          )}
        </>
      )}
    </div>
  );
}
