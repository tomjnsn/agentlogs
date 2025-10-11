import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchTranscript } from '../lib/api'
import type { TranscriptEvent } from '@aei/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/stat-card'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/transcripts/$id')({
  loader: ({ params }) => fetchTranscript(params.id),
  component: TranscriptDetailComponent,
})

function TranscriptDetailComponent() {
  const data = Route.useLoaderData()
  const { transcript, analysis } = data

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <StatCard label="Health Score" value={`${analysis.healthScore}%`} />
              <StatCard label="Retries" value={analysis.metrics.retries} />
              <StatCard label="Errors" value={analysis.metrics.errors} />
              <StatCard
                label="Failure Rate"
                value={`${(analysis.metrics.toolFailureRate * 100).toFixed(1)}%`}
              />
            </div>

            {analysis.antiPatterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Anti-Patterns</h4>
                <ul className="space-y-2">
                  {analysis.antiPatterns.map((ap, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge
                        variant={
                          ap.severity === 'high'
                            ? 'destructive'
                            : ap.severity === 'medium'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {ap.severity}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{ap.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recommendations</h4>
                <ul className="list-disc list-inside space-y-1">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      {rec}
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
  )
}

function EventCard({ event, index }: { event: TranscriptEvent; index: number }) {
  return (
    <Card
      className={cn(
        'border-l-4',
        event.type === 'user' && 'border-l-blue-500 bg-blue-50/50',
        event.type === 'assistant' && 'border-l-green-500 bg-green-50/50',
        event.type === 'tool_use' && 'border-l-purple-500 bg-purple-50/50',
        event.type === 'tool_result' && event.error
          ? 'border-l-red-500 bg-red-50/50'
          : 'border-l-gray-500 bg-gray-50/50'
      )}
    >
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-3">
          <Badge variant="outline">
            #{index + 1} {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {event.type === 'user' && (
          <pre className="text-sm whitespace-pre-wrap bg-background/50 p-3 rounded border">
            {event.message.content}
          </pre>
        )}

        {event.type === 'assistant' && (
          <div className="text-sm whitespace-pre-wrap bg-background/50 p-3 rounded border">
            {event.message.content.map((c) => c.text || '').join('')}
          </div>
        )}

        {event.type === 'tool_use' && (
          <>
            <div className="text-sm font-medium mb-2">Tool: {event.tool_name}</div>
            <pre className="text-xs whitespace-pre-wrap bg-background/50 p-3 rounded border overflow-x-auto">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          </>
        )}

        {event.type === 'tool_result' && (
          <>
            <div className="text-sm font-medium mb-2">Result: {event.tool_name}</div>
            {event.error ? (
              <div className="text-sm text-destructive bg-background/50 p-3 rounded border">
                Error: {event.error}
              </div>
            ) : (
              <pre className="text-xs whitespace-pre-wrap bg-background/50 p-3 rounded border overflow-x-auto">
                {JSON.stringify(event.tool_response, null, 2)}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
