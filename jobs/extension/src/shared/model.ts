import { z } from "zod";
export const httpUrl = z
  .string()
  .max(4000)
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "HTTP(S) URL required");
const nullable = (max = 2000) => z.string().max(max).nullable().default(null);
export const jobSchema = z
  .object({
    id: z.string().min(1).max(200),
    identity_key: z.string().min(1).max(4500),
    company: nullable(),
    role: nullable(),
    description: nullable(50000),
    description_status: z
      .enum(["missing", "partial", "full"])
      .default("missing"),
    source: z.string().min(1).max(100),
    source_job_id: nullable(),
    source_url: httpUrl,
    application_url: httpUrl.nullable().default(null),
    canonical_url: httpUrl.nullable().default(null),
    ats_provider: nullable(),
    ats_tenant: nullable(),
    ats_job_id: nullable(),
    resolution_status: z
      .enum(["unresolved", "resolved", "in_board", "unavailable"])
      .default("unresolved"),
    type: nullable(),
    role_tags_json: z.string().default("[]"),
    employment_type: nullable(),
    location: nullable(),
    locations_json: z.string().default("[]"),
    work_mode: z.enum(["remote", "hybrid", "onsite"]).nullable().default(null),
    posted_at: nullable(),
    posted_at_raw: nullable(),
    first_seen_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    sources_json: z.string().default("[]"),
    metadata_json: z.string().default("{}"),
    archived_at: z.string().datetime().nullable().default(null),
  })
  .strict()
  .superRefine((j, ctx) => {
    for (const [key, array] of [
      ["role_tags_json", true],
      ["locations_json", true],
      ["sources_json", true],
      ["metadata_json", false],
    ] as const) {
      try {
        const v = JSON.parse(j[key]);
        if (
          !v ||
          typeof v !== "object" ||
          Array.isArray(v) !== array ||
          j[key].length > 1_000_000
        )
          throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Invalid JSON shape or size",
        });
      }
    }
    if (j.resolution_status === "resolved" && !j.application_url)
      ctx.addIssue({
        code: "custom",
        message: "Resolved jobs need an application URL",
      });
    if (j.description_status !== "missing" && !j.description)
      ctx.addIssue({ code: "custom", message: "Description text missing" });
  });
export type Job = z.infer<typeof jobSchema>;
export type Field = {
  field_id: string;
  label: string;
  control_type: string;
  required: boolean;
  answer_state: "answered" | "blank" | "unobserved" | "excluded";
  answer: unknown;
  captured_at: string;
};
export type PageSnapshot = {
  page_id: string;
  title: string;
  url: string;
  captured_at: string;
  fields: Field[];
  gaps: string[];
};
export type Capture = {
  cloud_revision?: number;
  schema_version: 1;
  capture_id: string;
  tab_id: number;
  origin: string;
  status: "recording" | "review" | "queued" | "saved";
  started_at: string;
  finished_at: string | null;
  job: Job;
  pages: PageSnapshot[];
  gaps: string[];
  submitted_at: string | null;
  application_id?: number;
  error?: string;
  existing_application_id?: number;
};
export type QueueItem = {
  claimToken?: string;
  id: string;
  kind: "job" | "application" | "capture";
  payload: unknown;
  attempts: number;
  error?: string;
  blocked?: boolean;
  next_try?: number;
};
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    for (const key of [...u.searchParams.keys()])
      if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key))
        u.searchParams.delete(key);
    return u.href;
  } catch {
    return null;
  }
}
export function sourceFor(url: string) {
  const h = new URL(url).hostname;
  return h.endsWith("linkedin.com")
    ? "linkedin"
    : h.endsWith("jobright.ai")
      ? "jobright"
      : h.endsWith("joinhandshake.com")
        ? "handshake"
        : h.endsWith("indeed.com")
          ? "indeed"
          : h;
}
export function category(title: string) {
  const s = title.toLowerCase();
  return /full[ -]?stack/.test(s)
    ? "full_stack"
    : /machine learning|\bai\b|\bml\b/.test(s)
      ? "ai_ml"
      : /cloud|devops|platform|\bsre\b/.test(s)
        ? "cloud"
        : /front[ -]?end/.test(s)
          ? "frontend"
          : /back[ -]?end/.test(s)
            ? "backend"
            : /data/.test(s)
              ? "data"
              : /mobile|ios|android/.test(s)
                ? "mobile"
                : /embedded|firmware/.test(s)
                  ? "embedded"
                  : null;
}
export function emptyJob(url: string): Job {
  const now = new Date().toISOString();
  const source = sourceFor(url);
  return jobSchema.parse({
    id: crypto.randomUUID(),
    identity_key: `${source}:${url}`,
    source,
    source_url: url,
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now,
  });
}
export function mergePages(pages: PageSnapshot[], next: PageSnapshot) {
  const old = pages.find((p) => p.page_id === next.page_id);
  const fields = new Map(old?.fields.map((f) => [f.field_id, f]));
  for (const f of next.fields) fields.set(f.field_id, f);
  return [
    ...pages.filter((p) => p.page_id !== next.page_id),
    {
      ...next,
      fields: [...fields.values()],
      gaps: [...new Set([...(old?.gaps || []), ...next.gaps])],
    },
  ];
}
export function exportUrls(jobs: Job[]) {
  return [
    ...new Set(
      jobs
        .filter((j) => !j.archived_at && j.resolution_status === "resolved")
        .map((j) => j.application_url)
        .filter((u): u is string => !!u),
    ),
  ].join("\n");
}
