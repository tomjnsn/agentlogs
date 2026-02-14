import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  async fetch(request: Request) {
    return handler.fetch(request);
  },
});
