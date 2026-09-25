import { requestSchemas } from './jobApiDefinition'
import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { CollectionError } from "./jobCollection";
import { appliedJobsPredicate } from "./appliedJobs";

type Sql = Pick<Client, "execute">;
type Data = Record<string, any>;
const now = () => new Date().toISOString();
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      ),
    )
    .digest("hex");
export function object(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CollectionError("Expected an object");
  return value as Data;
}
function text(value: unknown, name: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new CollectionError(`${name} must be nonempty text (max ${max})`);
  return value;
}
function optional(value: unknown, name: string, max = 2000) {
  return value === undefined || value === null ? null : text(value, name, max);
}
function uuid(value: unknown) {
  const s = text(value, "id", 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  )
    throw new CollectionError("Expected UUID");
  return s;
}
function timestamp(value: unknown) {
  const s = text(value, "timestamp", 40);
  if (
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s) ||
    !Number.isFinite(Date.parse(s))
  )
    throw new CollectionError("Expected timestamp with timezone");
  return new Date(s).toISOString();
}
function doc(value: unknown, fallback: unknown = {}) {
  const v = value ?? fallback;
  const s = JSON.stringify(v);
  if (s.length > 1_000_000)
    throw new CollectionError(
      "JSON document exceeds 1,000,000 characters",
      413,
    );
  return s;
}
function version(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new CollectionError("Current numeric version is required", 428);
  return Number(value);
}
function allowed(body: Data, keys: string[]) {
  for (const k of Object.keys(body))
    if (!keys.includes(k)) throw new CollectionError(`Unknown field: ${k}`);
}
async function row(db: Sql, table: string, id: string | number): Promise<Data> {
  const r = await db.execute({
    sql: `SELECT * FROM ${table} WHERE id=?`,
    args: [id],
  });
  if (!r.rows[0]) throw new CollectionError("Record not found", 404);
  return r.rows[0];
}
async function transaction<T>(
  db: Client,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await db.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    if (!tx.closed) await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
function assertLease(attempt: Data, token: unknown, actor: string) {
  if (
    attempt.actor !== actor ||
    attempt.lease_token_hash !== hash(text(token, "claim_token", 200))
  )
    throw new CollectionError("Attempt belongs to another worker", 403);
  if (attempt.state !== "running" || attempt.lease_expires_at <= now())
    throw new CollectionError(
      "Attempt is finished or lease expired. Reconcile before retrying.",
      409,
    );
}
async function summary(
  db: Sql,
  id: string,
  status: string,
  notes: string,
  actor: string,
  applicationId?: number,
) {
  const j = await row(db, "job_collection", id);
  const at = now();
  const history = JSON.parse(j.status_history_json);
  history.push({ status, notes, at, actor });
  const ids = JSON.parse(j.application_ids_json);
  if (applicationId && !ids.includes(applicationId)) ids.push(applicationId);
  await db.execute({
    sql: "UPDATE job_collection SET status=?,status_notes=?,status_updated_at=?,status_history_json=?,application_ids_json=?,updated_at=?,version=version+1 WHERE id=?",
    args: [
      status,
      notes,
      at,
      JSON.stringify(history),
      JSON.stringify(ids),
      at,
      id,
    ],
  });
}
export function publicAttempt(a: Data) {
  const {
    lease_token_hash,
    completion_hash,
    completion_result_json,
    outcome_hash,
    ...safe
  } = a;
  void lease_token_hash;
  void completion_hash;
  void completion_result_json;
  void outcome_hash;
  return safe;
}

export async function claimAttempt(db: Client, body: Data, actor: string) {
  allowed(body, [
    "id",
    "collection_id",
    "version",
    "claim_token",
    "worker_id",
    "agent_model",
    "parent_attempt_id",
    "manual",
  ]);
  const id = uuid(body.id),
    jobId = uuid(body.collection_id),
    token = text(body.claim_token, "claim_token", 200);
  if (token.length < 32)
    throw new CollectionError("claim_token needs at least 32 characters");
  const v = version(body.version);
  const shape = requestSchemas.claim.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const prior = await tx.execute({
      sql: "SELECT * FROM job_attempts WHERE id=?",
      args: [id],
    });
    if (prior.rows[0]) {
      const p = prior.rows[0];
      if (
        p.collection_id !== jobId ||
        p.actor !== actor ||
        p.lease_token_hash !== hash(token)
      )
        throw new CollectionError("Attempt ID conflict", 409);
      return { attempt: publicAttempt(p), replayed: true };
    }
    const j = await row(tx, "job_collection", jobId);
    if (Number(j.version) !== v)
      throw new CollectionError(
        "Opportunity changed; reload before claiming",
        412,
      );
    if (
      j.status === "applied" ||
      j.archived_at ||
      j.status === "not_applicable"
    )
      throw new CollectionError(
        "Opportunity is already applied, dismissed, or archived",
        409,
      );
    const submitted = await tx.execute({
      sql: `SELECT id FROM job_applications WHERE (collection_id=? OR id IN (SELECT value FROM json_each(?))) AND ${appliedJobsPredicate}`,
      args: [jobId, j.application_ids_json],
    });
    if (submitted.rows.length)
      throw new CollectionError(
        "A linked submitted application already exists",
        409,
      );
    const active = await tx.execute({
      sql: "SELECT * FROM job_attempts WHERE collection_id=? AND state='running'",
      args: [jobId],
    });
    if (active.rows.length) {
      const a = active.rows[0];
      if (String(a.lease_expires_at) > now())
        throw new CollectionError("Another attempt owns this opportunity", 409);
      if (a.stage !== "filling")
        throw new CollectionError(
          "Expired attempt may have submitted. Report submission_unknown with the original worker or resolve in the portal.",
          409,
        );
      await tx.execute({
        sql: "UPDATE job_attempts SET state='finished',outcome='abandoned',ended_at=?,version=version+1 WHERE id=?",
        args: [now(), a.id],
      });
    }
    const blockers = await tx.execute({
      sql: "SELECT id FROM job_blockers WHERE collection_id=? AND status='open'",
      args: [jobId],
    });
    if (blockers.rows.length && body.manual !== true)
      throw new CollectionError(
        "Resolve open blockers before automated retry",
        409,
      );
    if (body.parent_attempt_id) {
      const p = await row(tx, "job_attempts", uuid(body.parent_attempt_id));
      if (p.collection_id !== jobId || p.state !== "finished")
        throw new CollectionError(
          "Parent attempt must be finished and belong to this job",
        );
    }
    const at = now(),
      expires = new Date(Date.now() + 5 * 60_000).toISOString();
    await tx.execute({
      sql: "INSERT INTO job_attempts(id,collection_id,parent_attempt_id,actor,worker_id,agent_model,started_at,heartbeat_at,lease_expires_at,lease_token_hash,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        id,
        jobId,
        body.parent_attempt_id || null,
        actor,
        optional(body.worker_id, "worker_id"),
        optional(body.agent_model, "agent_model"),
        at,
        at,
        expires,
        hash(token),
        JSON.stringify({ manual: body.manual === true }),
      ],
    });
    await summary(
      tx,
      jobId,
      "in_progress",
      body.manual ? "Manual application work started" : "Agent work started",
      actor,
    );
    return {
      attempt: publicAttempt(await row(tx, "job_attempts", id)),
      replayed: false,
    };
  });
}
export async function heartbeat(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  allowed(body, ["claim_token", "stage"]);
  const shape = requestSchemas.heartbeat.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const a = await row(tx, "job_attempts", uuid(id));
    assertLease(a, body.claim_token, actor);
    const stage = body.stage || a.stage;
    if (!["filling", "submit_started", "receipt_seen"].includes(stage))
      throw new CollectionError("Invalid stage");
    if (
      ["filling", "submit_started", "receipt_seen"].indexOf(stage) <
      ["filling", "submit_started", "receipt_seen"].indexOf(a.stage)
    )
      throw new CollectionError("Submission stage cannot move backwards");
    await tx.execute({
      sql: "UPDATE job_attempts SET stage=?,heartbeat_at=?,lease_expires_at=?,version=version+1 WHERE id=?",
      args: [stage, now(), new Date(Date.now() + 300000).toISOString(), id],
    });
    return { attempt: publicAttempt(await row(tx, "job_attempts", id)) };
  });
}

/** Explicit recovery never assumes that an expired browser session did not submit. */
export async function recoverAttempt(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  allowed(body, ["version"]);
  const shape = requestSchemas.recover.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const a = await row(tx, "job_attempts", uuid(id));
    if (Number(a.version) !== version(body.version))
      throw new CollectionError("Attempt changed; reload", 412);
    if (a.state !== "running" || a.lease_expires_at > now())
      throw new CollectionError(
        "Only expired running attempts can be recovered",
        409,
      );
    const uncertain = a.stage !== "filling",
      outcome = uncertain ? "submission_unknown" : "abandoned";
    await tx.execute({
      sql: "UPDATE job_attempts SET state='finished',outcome=?,ended_at=?,notes=?,version=version+1 WHERE id=?",
      args: [outcome, now(), "Expired attempt recovered by " + actor, id],
    });
    if (uncertain)
      await tx.execute({
        sql: "INSERT INTO job_blockers(id,collection_id,attempt_id,reason_code,summary,created_at) VALUES (?,?,?,?,?,?)",
        args: [
          randomUUID(),
          a.collection_id,
          id,
          "submission_unknown",
          "The previous worker may have submitted. Check the employer receipt before retrying.",
          now(),
        ],
      });
    await summary(
      tx,
      a.collection_id,
      uncertain ? "blocked" : "pending",
      "Expired attempt recovered",
      actor,
    );
    return { attempt: publicAttempt(await row(tx, "job_attempts", id)) };
  });
}

export async function finishOutcome(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  allowed(body, [
    "claim_token",
    "outcome",
    "reason_code",
    "notes",
    "details",
    "duration_seconds",
    "duration_scope",
    "evidence",
  ]);
  const outcome = text(body.outcome, "outcome");
  if (
    ![
      "blocked",
      "skipped",
      "failed",
      "cancelled",
      "submission_unknown",
    ].includes(outcome)
  )
    throw new CollectionError("Invalid non-submission outcome");
  const reason = optional(body.reason_code, "reason_code", 100),
    notes = text(body.notes, "notes", 50000);
  const fingerprint = hash(body);
  if (
    body.duration_seconds != null &&
    (typeof body.duration_seconds !== "number" ||
      !Number.isFinite(body.duration_seconds) ||
      body.duration_seconds < 0)
  )
    throw new CollectionError("Invalid measured duration");
  const shape = requestSchemas.outcome.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const a = await row(tx, "job_attempts", uuid(id));
    if (
      a.actor !== actor ||
      a.lease_token_hash !== hash(text(body.claim_token, "claim_token", 200))
    )
      throw new CollectionError("Worker mismatch", 403);
    if (a.state === "finished") {
      if (a.outcome_hash === fingerprint)
        return { attempt: publicAttempt(a), replayed: true };
      throw new CollectionError("Attempt already finished differently", 409);
    }
    if (a.stage !== "filling" && outcome !== "submission_unknown")
      throw new CollectionError(
        "After Submit starts, report submission_unknown or confirm completion",
        409,
      );
    const at = now();
    await tx.execute({
      sql: "UPDATE job_attempts SET state='finished',outcome=?,reason_code=?,notes=?,ended_at=?,duration_seconds=?,duration_scope=?,evidence_json=?,outcome_hash=?,version=version+1 WHERE id=?",
      args: [
        outcome,
        reason,
        notes,
        at,
        body.duration_seconds ?? null,
        optional(body.duration_scope, "duration_scope"),
        doc(body.evidence, []),
        fingerprint,
        id,
      ],
    });
    if (["blocked", "submission_unknown"].includes(outcome)) {
      await tx.execute({
        sql: "INSERT INTO job_blockers(id,collection_id,attempt_id,reason_code,summary,details_json,created_at) VALUES (?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          a.collection_id,
          id,
          outcome === "submission_unknown"
            ? "submission_unknown"
            : reason || "other",
          notes,
          doc(body.details),
          at,
        ],
      });
    }
    await summary(
      tx,
      a.collection_id,
      outcome === "skipped"
        ? "skipped"
        : outcome === "cancelled"
          ? "pending"
          : "blocked",
      notes,
      actor,
    );
    return {
      attempt: publicAttempt(await row(tx, "job_attempts", id)),
      replayed: false,
    };
  });
}

export async function saveCapture(db: Client, body: Data, actor: string) {
  allowed(body, [
    "id",
    "capture_session_id",
    "revision",
    "collection_id",
    "attempt_id",
    "schema_version",
    "state",
    "captured_at",
    "document",
  ]);
  const id = uuid(body.id),
    session = uuid(body.capture_session_id),
    jobId = uuid(body.collection_id),
    revision = version(body.revision),
    document = object(body.document),
    serialized = doc(document),
    fingerprint = hash(document);
  const state = body.state || "draft";
  if (!["draft", "finished", "imported"].includes(state))
    throw new CollectionError("Invalid capture state");
  // The document is flexible, but secret-bearing input types are never accepted.
  const stack: unknown[] = [document];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    const o = v as Data;
    if (
      ["password", "hidden"].includes(o.control_type) ||
      /^(?:one-time-code|cc-)/.test(o.autocomplete || "")
    )
      throw new CollectionError(
        "Remove password/security fields from captures",
      );
    stack.push(...Object.values(o));
  }
  const shape = requestSchemas.capture.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    await row(tx, "job_collection", jobId);
    if (body.attempt_id) {
      const a = await row(tx, "job_attempts", uuid(body.attempt_id));
      if (a.collection_id !== jobId)
        throw new CollectionError("Capture/attempt job mismatch");
    }
    const prior = await tx.execute({
      sql: "SELECT * FROM job_form_captures WHERE id=? OR (capture_session_id=? AND revision=?)",
      args: [id, session, revision],
    });
    if (prior.rows[0]) {
      const p = prior.rows[0];
      if (
        p.collection_id !== jobId ||
        p.capture_session_id !== session ||
        Number(p.revision) !== revision ||
        p.content_hash !== fingerprint
      )
        throw new CollectionError("Capture revision conflict", 409);
      return { capture: p, replayed: true };
    }
    await tx.execute({
      sql: "INSERT INTO job_form_captures(id,capture_session_id,revision,collection_id,attempt_id,state,captured_at,recorded_at,actor,document_json,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        id,
        session,
        revision,
        jobId,
        body.attempt_id || null,
        state,
        timestamp(body.captured_at),
        now(),
        actor,
        serialized,
        fingerprint,
      ],
    });
    return { capture: await row(tx, "job_form_captures", id), replayed: false };
  });
}

export async function resolveBlocker(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  allowed(body, ["version", "action", "notes", "resolution"]);
  const action = body.action;
  if (!["retry", "resolved", "dismiss"].includes(action))
    throw new CollectionError("Choose retry, resolved, or dismiss");
  const notes = text(body.notes, "notes", 50000);
  const shape = requestSchemas.resolve.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const b = await row(tx, "job_blockers", uuid(id));
    if (Number(b.version) !== version(body.version))
      throw new CollectionError("Blocker changed; reload", 412);
    if (b.status !== "open")
      throw new CollectionError("Blocker is already resolved", 409);
    await tx.execute({
      sql: "UPDATE job_blockers SET status=?,resolved_at=?,resolved_by=?,resolution_kind=?,resolution_json=?,version=version+1 WHERE id=?",
      args: [
        action === "dismiss" ? "dismissed" : "resolved",
        now(),
        actor,
        action,
        doc({ notes, details: body.resolution || {} }),
        id,
      ],
    });
    const open = await tx.execute({
      sql: "SELECT id FROM job_blockers WHERE collection_id=? AND status='open'",
      args: [b.collection_id],
    });
    const active = await tx.execute({
      sql: "SELECT id FROM job_attempts WHERE collection_id=? AND state='running'",
      args: [b.collection_id],
    });
    if (active.rows.length)
      throw new CollectionError(
        "Finish the running attempt before resolving/requeueing",
        409,
      );
    if (action === "retry" && !open.rows.length)
      await summary(tx, b.collection_id, "pending", notes, actor);
    if (action === "dismiss")
      await summary(tx, b.collection_id, "not_applicable", notes, actor);
    return { blocker: await row(tx, "job_blockers", id) };
  });
}

export async function completeAttempt(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  allowed(body, [
    "claim_token",
    "confirmed",
    "confirmation_kind",
    "submitted_at",
    "capture_id",
    "existing_application_id",
    "job",
    "resolve_blocker_ids",
    "evidence",
  ]);
  if (
    body.confirmed !== true ||
    !["user_confirmed", "ats_receipt"].includes(body.confirmation_kind)
  )
    throw new CollectionError("Explicit submission confirmation is required");
  const submitted = timestamp(body.submitted_at);
  if (Date.parse(submitted) > Date.now() + 60000)
    throw new CollectionError("Submission timestamp cannot be in the future");
  const fingerprint = hash(body);
  const edits = body.job ? object(body.job) : {};
  allowed(edits, [
    "company",
    "role",
    "description",
    "type",
    "source",
    "location",
    "work_mode",
    "application_url",
  ]);
  for (const [k, v] of Object.entries(edits))
    if (v !== null) text(v, k, k === "description" ? 50000 : 2000);
  const resolveIds = body.resolve_blocker_ids || [];
  if (!Array.isArray(resolveIds) || resolveIds.length > 100)
    throw new CollectionError("Invalid blocker IDs");
  resolveIds.forEach(uuid);
  const shape = requestSchemas.complete.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  return transaction(db, async (tx) => {
    const a = await row(tx, "job_attempts", uuid(id));
    if (
      a.actor !== actor ||
      a.lease_token_hash !== hash(text(body.claim_token, "claim_token", 200))
    )
      throw new CollectionError("Worker mismatch", 403);
    if (a.state === "finished") {
      if (a.completion_hash === fingerprint)
        return { ...JSON.parse(a.completion_result_json), replayed: true };
      throw new CollectionError("Attempt already finished differently", 409);
    }
    // A late receipt can safely complete the same still-running owner; it cannot revive an abandoned/replaced attempt.

    const j = {
      ...(await row(tx, "job_collection", a.collection_id)),
      ...edits,
    };
    text(j.company, "company");
    text(j.role, "role");
    let capture: Data | null = null;
    if (body.capture_id) {
      capture = await row(tx, "job_form_captures", uuid(body.capture_id));
      if (capture.collection_id !== a.collection_id)
        throw new CollectionError("Capture belongs to another opportunity");
    }
    let applicationId: number;
    const submissionKey = `collection:${a.collection_id}:initial`;
    const existing = await tx.execute({
      sql: "SELECT id FROM job_applications WHERE submission_key=?",
      args: [submissionKey],
    });
    if (existing.rows[0]) applicationId = Number(existing.rows[0].id);
    else if (body.existing_application_id) {
      if (!Number.isSafeInteger(body.existing_application_id))
        throw new CollectionError("Invalid tracker ID");
      const old = await row(
        tx,
        "job_applications",
        body.existing_application_id,
      );
      if (old.collection_id && old.collection_id !== a.collection_id)
        throw new CollectionError(
          "Tracker record is linked to a different job",
          409,
        );
      if (
        !["submitted", "applied", ""].includes(
          String(old.status || "")
            .trim()
            .toLowerCase(),
        )
      )
        throw new CollectionError(
          "Existing tracker record is not a submitted application",
        );
      applicationId = Number(old.id);
      await tx.execute({
        sql: "UPDATE job_applications SET collection_id=?,attempt_id=?,submission_key=?,version=version+1 WHERE id=?",
        args: [a.collection_id, id, submissionKey, applicationId],
      });
    } else {
      const at = now();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(submitted));
      const r = await tx.execute({
        sql: `INSERT INTO job_applications(company,role,description,date,source,type,location,work_mode,application_url,status,submitted_at,started_at,completed_at,agent_model,evidence_refs,other_details,request_key,request_hash,collection_id,attempt_id,capture_id,submission_key,confirmation_kind,confirmed_at,confirmed_by,confirmation_json) VALUES (?,?,?,?,?,?,?,?,?,'submitted',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        args: [
          j.company,
          j.role,
          j.description,
          date,
          j.source,
          j.type,
          j.location,
          j.work_mode,
          j.application_url || j.source_url,
          submitted,
          a.started_at,
          at,
          a.agent_model,
          doc(body.evidence, []),
          capture ? capture.document_json : null,
          `workflow:${id}`,
          fingerprint,
          a.collection_id,
          id,
          capture?.id || null,
          submissionKey,
          body.confirmation_kind,
          at,
          actor,
          doc({ confirmed: true, evidence: body.evidence || [] }),
        ],
      });
      applicationId = Number(r.rows[0].id);
    }
    const result = {
      application_id: applicationId,
      attempt_id: id,
      collection_id: a.collection_id,
    };
    await tx.execute({
      sql: "UPDATE job_attempts SET state='finished',outcome='submitted',application_id=?,ended_at=?,completion_hash=?,completion_result_json=?,evidence_json=?,version=version+1 WHERE id=?",
      args: [
        applicationId,
        now(),
        fingerprint,
        JSON.stringify(result),
        doc(body.evidence, []),
        id,
      ],
    });
    if (capture)
      await tx.execute({
        sql: "UPDATE job_form_captures SET application_id=?,state='submitted_snapshot' WHERE id=?",
        args: [applicationId, capture.id],
      });
    for (const blockerId of resolveIds) {
      const b = await row(tx, "job_blockers", blockerId);
      if (b.collection_id !== a.collection_id)
        throw new CollectionError("Blocker belongs to another opportunity");
      if (b.status === "open")
        await tx.execute({
          sql: "UPDATE job_blockers SET status='resolved',resolved_at=?,resolved_by=?,resolution_kind='submitted',resolution_attempt_id=?,resolution_json=?,version=version+1 WHERE id=?",
          args: [
            now(),
            actor,
            id,
            doc({ application_id: applicationId }),
            blockerId,
          ],
        });
    }
    await summary(
      tx,
      a.collection_id,
      "applied",
      "Submission confirmed",
      actor,
      applicationId,
    );
    return { ...result, replayed: false };
  });
}

export async function workflowDetail(db: Client, id: string) {
  const job = await row(db, "job_collection", uuid(id));
  const [attempts, blockers, captures] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM job_attempts WHERE collection_id=? ORDER BY started_at DESC",
      args: [id],
    }),
    db.execute({
      sql: "SELECT * FROM job_blockers WHERE collection_id=? ORDER BY created_at DESC",
      args: [id],
    }),
    db.execute({
      sql: "SELECT id,capture_session_id,revision,collection_id,attempt_id,application_id,schema_version,state,captured_at,recorded_at,actor FROM job_form_captures WHERE collection_id=? ORDER BY recorded_at DESC LIMIT 50",
      args: [id],
    }),
  ]);
  return {
    job,
    attempts: attempts.rows.map(publicAttempt),
    blockers: blockers.rows,
    captures: captures.rows,
  };
}
export async function workflowList(
  db: Client,
  kind: string,
  params: URLSearchParams,
) {
  const table = kind === "blockers" ? "job_blockers" : "job_attempts";
  const where: string[] = [],
    args: string[] = [];
  for (const key of [
    "collection_id",
    ...(kind === "blockers" ? ["status", "reason_code"] : ["outcome", "actor"]),
  ]) {
    const v = params.get(key);
    if (v) {
      where.push(`t.${key}=?`);
      args.push(v);
    }
  }
  const offset = Number(params.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new CollectionError("Invalid offset");
  const filter = where.length ? "WHERE " + where.join(" AND ") : "";
  const results = await db.execute({
    sql: `SELECT t.*,j.company,j.role,j.application_url,j.source_url FROM ${table} t JOIN job_collection j ON j.id=t.collection_id ${filter} ORDER BY t.${kind === "blockers" ? "created_at" : "started_at"} DESC,t.id LIMIT 50 OFFSET ?`,
    args: [...args, offset],
  });
  const total = await db.execute({
    sql: `SELECT count(*) n FROM ${table} t ${filter}`,
    args,
  });
  return {
    items: results.rows.map((r) =>
      kind === "attempts" ? publicAttempt(r) : r,
    ),
    total: Number(total.rows[0].n),
    offset,
  };
}
export async function workflowMetrics(db: Client) {
  const at = now();
  const days = new Map<string, number>();
  const day = (s: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s));
  const today = day(at);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    days.set(d.toISOString().slice(0, 10), 0);
  }
  const applications = await db.execute(
    `SELECT date,submitted_at FROM job_applications WHERE ${appliedJobsPredicate}`,
  );
  let legacy = 0;
  for (const r of applications.rows) {
    const exact =
      r.submitted_at && Number.isFinite(Date.parse(String(r.submitted_at)));
    if (!exact) legacy++;
    const d = exact ? day(String(r.submitted_at)) : String(r.date || "");
    if (days.has(d)) days.set(d, days.get(d)! + 1);
  }
  const [outcomes, blockers] = await Promise.all([
    db.execute(
      "SELECT outcome,count(*) count FROM job_attempts GROUP BY outcome",
    ),
    db.execute(
      "SELECT reason_code,count(*) count FROM job_blockers WHERE status='open' GROUP BY reason_code",
    ),
  ]);
  return {
    timezone: "America/New_York",
    today: days.get(today) || 0,
    total: applications.rows.length,
    legacy_date_records: legacy,
    daily: [...days].map(([date, count]) => ({ date, count })),
    outcomes: outcomes.rows,
    open_blockers: blockers.rows,
  };
}

export async function getCapture(db: Client, id: string) {
  return { capture: await row(db, "job_form_captures", uuid(id)) };
}
