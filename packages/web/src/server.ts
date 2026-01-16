import * as Sentry from "@sentry/tanstackstart-react";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

Sentry.init({
  dsn: "https://29ad86aa7e3802d0b0838f4d7ab55311@o4510717166682112.ingest.de.sentry.io/4510717169631312",
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
});

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return handler.fetch(request);
    },
  }),
);
