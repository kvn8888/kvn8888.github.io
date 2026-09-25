import { createHash } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { z } from "zod";
import { jobSchema, httpUrl, type Job } from "../shared/model";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const obj = (s: unknown, fallback: any) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
};
function aliases(j: Job) {
  return [
    {
      source: j.source,
      source_job_id: j.source_job_id,
      source_url: j.source_url,
    },
    ...obj(j.sources_json, []),
  ];
}
function unique(items: any[]) {
  return [...new Map(items.map((v) => [JSON.stringify(v), v])).values()];
}
function merge(existing: Job, incoming: Job): Job {
  const newer = incoming.last_seen_at >= existing.last_seen_at;
  const result = { ...existing };
  const previousEdits = new Set(
    obj(existing.metadata_json, {}).user_edited_fields || [],
  );
  const incomingEdits = new Set(
    obj(incoming.metadata_json, {}).user_edited_fields || [],
  );
  for (const key of [
    "company",
    "role",
    "application_url",
    "canonical_url",
    "ats_provider",
    "ats_tenant",
    "ats_job_id",
    "type",
    "employment_type",
    "location",
    "work_mode",
    "posted_at",
    "posted_at_raw",
  ] as const) {
    if (
      incomingEdits.has(key) ||
      (!previousEdits.has(key) && incoming[key] && (newer || !result[key]))
    )
      (result as any)[key] = incoming[key];
  }
  const rank = { missing: 0, partial: 1, full: 2 };
  if (
    incomingEdits.has("description") ||
    (!previousEdits.has("description") &&
      incoming.description &&
      (rank[incoming.description_status] > rank[existing.description_status] ||
        (newer &&
          rank[incoming.description_status] ===
            rank[existing.description_status])))
  ) {
    result.description = incoming.description;
    result.description_status = incoming.description_status;
  }
  result.resolution_status = result.application_url
    ? "resolved"
    : incomingEdits.has("application_url")
      ? "unresolved"
      : existing.resolution_status === "unresolved"
        ? incoming.resolution_status
        : existing.resolution_status;
  result.first_seen_at = [
    existing.first_seen_at,
    incoming.first_seen_at,
  ].sort()[0];
  result.last_seen_at = [existing.last_seen_at, incoming.last_seen_at]
    .sort()
    .at(-1)!;
  result.sources_json = JSON.stringify(
    unique([...aliases(existing), ...aliases(incoming)]),
  );
  result.role_tags_json = JSON.stringify(
    unique([
      ...obj(existing.role_tags_json, []),
      ...obj(incoming.role_tags_json, []),
    ]),
  );
  result.locations_json = JSON.stringify(
    unique([
      ...obj(existing.locations_json, []),
      ...obj(incoming.locations_json, []),
    ]),
  );
  const oldMeta = obj(existing.metadata_json, {}),
    nextMeta = obj(incoming.metadata_json, {});
  result.metadata_json = JSON.stringify({
    ...nextMeta,
    ...oldMeta,
    user_edited_fields: [...new Set([...previousEdits, ...incomingEdits])],
    aliases: unique([
      ...(oldMeta.aliases || []),
      ...(nextMeta.aliases || []),
      ...(existing.id === incoming.id ? [] : [incoming.id]),
    ]),
  });
  const unchanged =
    JSON.stringify({ ...existing, updated_at: "" }) ===
    JSON.stringify({ ...result, updated_at: "" });
  result.updated_at = unchanged
    ? existing.updated_at
    : new Date().toISOString();
  return result;
}
const captureDocument = z
  .object({
    schema_version: z.literal(1),
    capture_id: z.string().uuid(),
    job: jobSchema,
    pages: z
      .array(
        z
          .object({
            page_id: z.string().max(5000),
            title: z.string().max(2000),
            url: httpUrl,
            captured_at: z.string().datetime(),
            fields: z
              .array(
                z
                  .object({
                    field_id: z.string().max(5000),
                    label: z.string().max(10000),
                    control_type: z.string().max(100),
                    required: z.boolean(),
                    answer_state: z.enum([
                      "answered",
                      "blank",
                      "unobserved",
                      "excluded",
                    ]),
                    answer: z.unknown(),
                    captured_at: z.string().datetime(),
                  })
                  .strict(),
              )
              .max(1000),
            gaps: z.array(z.string().max(2000)).max(100),
          })
          .strict(),
      )
      .max(100),
    gaps: z.array(z.string().max(2000)).max(100),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime(),
    submitted_at: z.string().datetime(),
    submission_confirmation: z.literal("user_confirmed"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export class Store {
  constructor(public db: Client) {}
  async verify() {
    for (const table of ["job_collection", "job_applications"]) {
      const r = await this.db.execute(`PRAGMA table_info(${table})`);
      const names = new Set(r.rows.map((x) => x.name));
      const needed =
        table === "job_collection"
          ? ["id", "identity_key", "metadata_json", "sources_json"]
          : [
              "id",
              "other_details",
              "request_key",
              "request_hash",
              "submitted_at",
              "application_url",
            ];
      if (needed.some((n) => !names.has(n)))
        throw new Error(`Missing required schema in ${table}`);
    }
  }
  async collect(input: unknown) {
    const job = jobSchema.parse(input);
    let tx: Transaction | undefined;
    try {
      tx = await this.db.transaction("write");
      const found = await tx.execute({
        sql: `SELECT * FROM job_collection c WHERE id=? OR identity_key=? OR (source=? AND source_job_id IS NOT NULL AND source_job_id=?) OR (canonical_url IS NOT NULL AND canonical_url=?) OR (ats_provider=? AND ats_tenant=? AND ats_job_id=?) OR EXISTS (SELECT 1 FROM json_each(c.sources_json) a WHERE json_extract(a.value,'$.source')=? AND ((? IS NOT NULL AND json_extract(a.value,'$.source_job_id')=?) OR json_extract(a.value,'$.source_url')=?)) OR EXISTS(SELECT 1 FROM json_each(c.metadata_json,'$.aliases') a WHERE a.value=?) ORDER BY first_seen_at,id`,
        args: [
          job.id,
          job.identity_key,
          job.source,
          job.source_job_id,
          job.canonical_url,
          job.ats_provider,
          job.ats_tenant,
          job.ats_job_id,
          job.source,
          job.source_job_id,
          job.source_job_id,
          job.source_url,
          job.id,
        ],
      });
      const records = found.rows.map((r) => jobSchema.parse(r));
      let result = records.length ? records.reduce((a, b) => merge(a, b)) : job;
      if (records.length) result = merge(result, job);
      for (const other of records.filter((r) => r.id !== result.id))
        await tx.execute({
          sql: "DELETE FROM job_collection WHERE id=?",
          args: [other.id],
        });
      const keys = Object.keys(result) as (keyof Job)[];
      await tx.execute({
        sql: `INSERT INTO job_collection (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
          .filter((k) => k !== "id")
          .map((k) => `${k}=excluded.${k}`)
          .join(",")}`,
        args: keys.map((k) => result[k]),
      });
      await tx.commit();
      return result;
    } catch (e) {
      if (tx && !tx.closed) await tx.rollback();
      throw e;
    } finally {
      tx?.close();
    }
  }
  async search(params: URLSearchParams) {
    const filters = ["archived_at IS NULL"];
    const args: any[] = [];
    for (const k of ["company", "location", "role"] as const) {
      const value = params.get(k);
      if (value) {
        filters.push(`${k} LIKE ? ESCAPE '\\'`);
        args.push(`%${value.replace(/[\\%_]/g, "\\$&")}%`);
      }
    }
    for (const k of ["source", "type", "work_mode", "resolution_status"]) {
      const v = params.get(k);
      if (v) {
        filters.push(`${k}=?`);
        args.push(v);
      }
    }
    if (params.get("since")) {
      filters.push("first_seen_at>=?");
      args.push(z.string().datetime().parse(params.get("since")));
    }
    if (params.get("q")) {
      filters.push(
        "(company LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
      );
      const v = `%${params.get("q")!.replace(/[\\%_]/g, "\\$&")}%`;
      args.push(v, v, v);
    }
    const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .parse(params.get("limit") || 50),
      offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(params.get("offset") || 0);
    const where = filters.join(" AND ");
    const [rows, total] = await Promise.all([
      this.db.execute({
        sql: `SELECT id,company,role,source,source_url,application_url,resolution_status,type,work_mode,location,description_status,first_seen_at,last_seen_at FROM job_collection WHERE ${where} ORDER BY first_seen_at DESC,id LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      this.db.execute({
        sql: `SELECT count(*) AS total FROM job_collection WHERE ${where}`,
        args,
      }),
    ]);
    return {
      jobs: rows.rows,
      total: Number(total.rows[0].total),
      limit,
      offset,
    };
  }
  async getJob(id: string) {
    const r = await this.db.execute({
      sql: "SELECT * FROM job_collection WHERE id=? OR EXISTS (SELECT 1 FROM json_each(metadata_json,'$.aliases') a WHERE a.value=?)",
      args: [id, id],
    });
    if (!r.rows[0]) throw new ApiError(404, "Job not found");
    return r.rows[0];
  }
  async submit(input: unknown, key: string) {
    const capture = captureDocument.parse(input);
    if (key !== `jobsutility:${capture.capture_id}`)
      throw new ApiError(400, "Retry key must match capture ID");
    if (!capture.job.company?.trim() || !capture.job.role?.trim())
      throw new ApiError(400, "Company and role are required");
    const details = JSON.stringify(capture);
    if (details.length > 1_000_000)
      throw new ApiError(
        413,
        "Capture exceeds 1,000,000 characters; remove unnecessary fields before saving",
      );
    const hash = createHash("sha256").update(details).digest("hex");
    const j = capture.job;
    const inserted = await this.db.execute({
      sql: `INSERT INTO job_applications(company,role,description,date,source,type,location,work_mode,application_url,status,submitted_at,started_at,completed_at,other_details,request_key,request_hash,external_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING RETURNING id`,
      args: [
        j.company,
        j.role,
        j.description,
        capture.date,
        j.source,
        j.type,
        j.location,
        j.work_mode,
        j.application_url || j.source_url,
        "submitted",
        capture.submitted_at,
        capture.started_at,
        capture.finished_at,
        details,
        key,
        hash,
        capture.capture_id,
      ],
    });
    if (inserted.rows.length)
      return { id: Number(inserted.rows[0].id), replayed: false };
    const prior = await this.db.execute({
      sql: "SELECT id,request_hash FROM job_applications WHERE request_key=?",
      args: [key],
    });
    if (prior.rows[0]?.request_hash !== hash)
      throw new ApiError(
        409,
        "This capture was already saved with different data. Keep the original retry payload.",
      );
    return { id: Number(prior.rows[0].id), replayed: true };
  }
  async applications() {
    return (
      await this.db.execute(
        "SELECT id,company,role,date,status,source,application_url FROM job_applications ORDER BY id DESC LIMIT 100",
      )
    ).rows;
  }
  async application(id: number) {
    const r = await this.db.execute({
      sql: "SELECT id,company,role,description,date,source,type,location,work_mode,status,application_url,other_details FROM job_applications WHERE id=?",
      args: [id],
    });
    if (!r.rows[0]) throw new ApiError(404, "Application not found");
    return r.rows[0];
  }
}
