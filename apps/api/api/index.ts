/**
 * Serverless entry point for the API (ADR-0006).
 *
 * `src/server.ts` exports the Express application and only calls `listen()`
 * when it is the process entry point, so the same file serves both a long-lived
 * container locally and a function here. An Express app is already a
 * `(req, res)` handler, which is exactly what this runtime expects, so there is
 * no adapter to write and no second copy of the middleware order to keep in
 * sync.
 *
 * Every path is routed here by `vercel.json`. The API mounts its own routes
 * under `/api/v1`, and the original request path survives the rewrite, so
 * routing inside Express is unchanged from local development.
 */
export { app as default } from '../src/server.ts';
