import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getRepos } from "../lib/server-functions";
import { authClient } from "../lib/auth-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Check if user is authenticated
    const { data: session } = await authClient.getSession();

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
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold text-red-600">Error</h2>
      <p className="text-gray-600 mt-2">{error.message}</p>
      {error.message.includes("Unauthorized") && (
        <p className="text-sm text-gray-500 mt-4">
          Please sign in with GitHub using the button in the header.
        </p>
      )}
    </div>
  );
}

function IndexComponent() {
  const repos = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Repositories</h2>

      {repos.length === 0 ? (
        <p className="text-muted-foreground">
          No repositories yet. Start capturing transcripts!
        </p>
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
                        <div className="font-medium">{repo.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {repo.id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{repo.transcriptCount}</TableCell>
                    <TableCell>N/A</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(repo.lastActivity).toLocaleString()}
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
