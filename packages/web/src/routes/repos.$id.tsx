import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchTranscripts } from '../lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HealthBadge } from '@/components/health-badge'

export const Route = createFileRoute('/repos/$id')({
  loader: ({ params }) => fetchTranscripts(params.id),
  component: RepoDetailComponent,
})

function RepoDetailComponent() {
  const transcripts = Route.useLoaderData()
  const { id } = Route.useParams()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">← Back to Dashboard</Link>
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">
          Repository: {decodeURIComponent(id)}
        </h2>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transcripts.map((transcript) => (
                <TableRow key={transcript.id}>
                  <TableCell>
                    <code className="text-sm font-mono">
                      {transcript.sessionId.slice(0, 8)}...
                    </code>
                  </TableCell>
                  <TableCell>{transcript.eventCount}</TableCell>
                  <TableCell>
                    <HealthBadge score={transcript.healthScore} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(transcript.createdAt).toLocaleString()}
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
  )
}
