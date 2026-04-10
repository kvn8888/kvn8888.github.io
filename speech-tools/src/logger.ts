/**
 * logger.ts — Structured logger for speech-tools.
 *
 * Uses pino (fast JSON logger) with an optional Axiom transport for
 * off-platform log shipping. When AXIOM_TOKEN + AXIOM_DATASET are set,
 * logs go to both stdout AND Axiom simultaneously via a pino worker thread.
 * Without those env vars, logs go to stdout only (Render captures stdout).
 *
 * Axiom free tier: 500 GB/month, 30-day retention — plenty for this service.
 *
 * Setup:
 *   1. Create a free Axiom account at axiom.co
 *   2. Create a dataset (e.g. "speech-tools")
 *   3. Create an API token with ingest access to that dataset
 *   4. Set AXIOM_TOKEN and AXIOM_DATASET in the Render service env vars
 */

import pino from "pino";

// Decide which transport targets to use based on available env vars.
// pino.transport() runs transports in a worker thread, so a bad Axiom
// connection won't block or crash the main application thread.
function buildTransport() {
  const targets: pino.TransportTargetOptions[] = [
    // Always write JSON to stdout — Render captures and displays this in the logs tab
    { target: "pino/file", options: { destination: 1 } },
  ];

  // Conditionally add Axiom when credentials are available
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    targets.push({
      target: "@axiomhq/pino",
      options: {
        token: process.env.AXIOM_TOKEN,
        dataset: process.env.AXIOM_DATASET,
      },
    });
  }

  return pino.transport({ targets });
}

/**
 * The global logger instance.
 * Use child loggers (logger.child({requestId})) to add per-request context
 * without mutating the base logger.
 */
export const logger = pino({ level: "info" }, buildTransport());
