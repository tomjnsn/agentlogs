import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getRepos, getSession } from "../lib/server-functions";

type ReposData = Awaited<ReturnType<typeof getRepos>>;

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Check if user is authenticated
    const session = await getSession();

    if (!session) {
      // Redirect to sign-in page
      throw redirect({
        to: "/sign-in",
      });
    }
  },
  loader: async () => {
    try {
      return await getRepos();
    } catch (error) {
      console.error("Failed to load repos:", error);
      throw error;
    }
  },
  component: IndexComponent,
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

function IndexComponent() {
  const repos = Route.useLoaderData() as ReposData;
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

      {repos.length === 0 ? (
        <p className="text-muted-foreground">No repositories yet. Start capturing transcripts!</p>
      ) : (
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
                {repos.map((repo) => (
                  <TableRow key={repo.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{repo.repo}</div>
                        <div className="text-muted-foreground text-sm">{repo.id}</div>
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
    </div>
  );
}
