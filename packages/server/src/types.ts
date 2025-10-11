// The Env interface is now generated globally in worker-configuration.d.ts
// by running `bun wrangler types`
// We re-export it here for convenience, so that imports still work

// Use a type alias to reference the global Env
export type Env = globalThis.Env;
