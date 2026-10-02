import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Client } from "@libsql/client";
import { handoffPacketSchema } from "./handoffPacketSchema";
import { requestSchemas } from "./jobApiDefinition";
import { CollectionError, decodeCollection } from "./jobCollection";
import {
  hash,
  text,
  uuid,
  doc,
  timestamp,
  version,
  row,
  transaction,
  assertLease,
  summary,
  now,
  claimAttempt,
  type Data,
} from "./jobWorkflow";
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(handoffPacketSchema);
function packets(input: unknown): Data[] {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new CollectionError("Provide 1–20 page packets");
  doc(input);
  for (const p of input) {
    if (!validate(p))
      throw new CollectionError(
        "Invalid handoff packet: " + ajv.errorsText(validate.errors),
      );
    if (!["captcha_blocked", "ready_for_human", "imported"].includes(p.status))
      throw new CollectionError("Handoff packet is already closed");
    for (const link of [
      p.application_url,
      ...((p as Data).fields || [])
        .map((f: Data) => f.frame_url)
        .filter(Boolean),
    ]) {
      const u = new URL(link);
      if (
        u.username ||
        u.password ||
        [...u.searchParams.keys()].some((k) =>
          /^(access_token|id_token|refresh_token|password|otp|code|session|sessionid|csrf)$/i.test(
            k,
          ),
        )
      )
        throw new CollectionError(
          "Use reusable URLs without credentials or session parameters",
        );
    }
  }
  return input;
}
export async function queueHandoff(
  db: Client,
  attemptId: string,
  body: Data,
  actor: string,
) {
  const shape = requestSchemas.handoff.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  const id = uuid(body.id),
    captured = packets(body.packets),
    notes = text(body.notes, "notes", 50000),
    fingerprint = hash({ handoff: body });
  return transaction(db, async (tx) => {
    const a = await row(tx, "job_attempts", uuid(attemptId));
    if (a.actor !== actor || a.lease_token_hash !== hash(body.claim_token))
      throw new CollectionError("Worker mismatch", 403);
    if (a.state === "finished") {
      if (a.outcome_hash !== fingerprint)
        throw new CollectionError("Attempt finished differently", 409);
      return { handoff: await row(tx, "job_blockers", id), replayed: true };
    }
    assertLease(a, body.claim_token, actor);
    if (a.stage !== "filling")
      throw new CollectionError(
        "Submission may have started; reconcile receipt instead of creating a retry handoff",
        409,
      );
    const j = await row(tx, "job_collection", a.collection_id);
    if (j.availability === "expired")
      throw new CollectionError("Posting is expired", 409);
    const at = now();
    const document = {
      kind: "human_handoff",
      schema_version: 1,
      packets: captured,
      gaps: body.gaps || [],
      resume_instructions: body.resume_instructions || null,
    };
    await tx.execute({
      sql: "INSERT INTO job_form_captures(id,capture_session_id,revision,collection_id,attempt_id,state,captured_at,recorded_at,actor,document_json,content_hash) VALUES(?,?,1,?,?,'finished',?,?,?,?,?)",
      args: [
        id,
        id,
        a.collection_id,
        a.id,
        at,
        at,
        actor,
        doc(document),
        hash(document),
      ],
    });
    await tx.execute({
      sql: "INSERT INTO job_blockers(id,collection_id,attempt_id,reason_code,summary,details_json,created_at,handoff_capture_id) VALUES(?,?,?,?,?,?,?,?)",
      args: [
        id,
        a.collection_id,
        a.id,
        body.reason_code,
        notes,
        doc({ page_count: captured.length, gaps: body.gaps || [] }),
        at,
        id,
      ],
    });
    await tx.execute({
      sql: "UPDATE job_attempts SET state='finished',outcome='blocked',reason_code=?,notes=?,ended_at=?,outcome_hash=?,version=version+1 WHERE id=?",
      args: [body.reason_code, notes, at, fingerprint, a.id],
    });
    await summary(tx, a.collection_id, "blocked", notes, actor);
    return { handoff: await row(tx, "job_blockers", id), replayed: false };
  });
}
export async function listHandoffs(db: Client, params: URLSearchParams) {
  const offset = Number(params.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new CollectionError("Invalid offset");
  const state = params.get("status") || "open";
  if (!["open", "resolved", "dismissed"].includes(state))
    throw new CollectionError("Invalid status");
  const r = await db.execute({
    sql: `SELECT b.id,b.collection_id,b.attempt_id,b.reason_code,b.summary,b.created_at,b.version,b.status,b.handoff_capture_id,j.company,j.role,j.application_url,j.source_url,j.availability,
 (SELECT id FROM job_attempts a WHERE a.collection_id=b.collection_id AND a.state='running' LIMIT 1) AS active_attempt_id
 FROM job_blockers b JOIN job_collection j ON j.id=b.collection_id WHERE b.handoff_capture_id IS NOT NULL AND b.status=? AND (b.status<>'open' OR (j.availability<>'expired' AND j.status<>'applied')) ORDER BY b.created_at DESC,b.id DESC LIMIT 50 OFFSET ?`,
    args: [state, offset],
  });
  const count = await db.execute({
    sql: `SELECT count(*) n FROM job_blockers b JOIN job_collection j ON j.id=b.collection_id WHERE b.handoff_capture_id IS NOT NULL AND b.status=? AND (b.status<>'open' OR (j.availability<>'expired' AND j.status<>'applied'))`,
    args: [state],
  });
  return { items: r.rows, total: Number(count.rows[0].n), offset };
}
export async function getHandoff(db: Client, id: string) {
  const b = await row(db, "job_blockers", uuid(id));
  if (!b.handoff_capture_id)
    throw new CollectionError("No restorable handoff for this blocker", 404);
  const c = await row(db, "job_form_captures", b.handoff_capture_id);
  return {
    handoff: b,
    job: decodeCollection(await row(db, "job_collection", b.collection_id)),
    document: JSON.parse(c.document_json),
  };
}
export async function claimHandoff(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  if (actor === "tracker-agent" || actor === "tracker-reader")
    throw new CollectionError(
      "Use the extension credential or signed-in user for manual handoffs",
      403,
    );
  const shape = requestSchemas.handoffClaim.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  const b = await row(db, "job_blockers", uuid(id));
  return claimAttempt(
    db,
    {
      ...body,
      collection_id: b.collection_id,
      manual: true,
      handoff_id: id,
      parent_attempt_id: b.attempt_id,
      worker_id: "human-handoff-extension",
    },
    actor,
  );
}
export async function postingAvailability(
  db: Client,
  id: string,
  body: Data,
  actor: string,
) {
  const shape = requestSchemas.availability.safeParse(body);
  if (!shape.success) throw new CollectionError(shape.error.issues[0].message);
  const u = new URL(body.evidence.url);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new CollectionError("Public evidence URL required");
  timestamp(body.evidence.observed_at);
  if (
    !Number.isFinite(Date.parse(body.evidence.observed_at)) ||
    Date.parse(body.evidence.observed_at) > Date.now() + 60000
  )
    throw new CollectionError("Valid observed timestamp required");
  return transaction(db, async (tx) => {
    const j = await row(tx, "job_collection", uuid(id));
    if (Number(j.version) !== version(body.version))
      throw new CollectionError("Opportunity changed; reload", 412);
    const active = await tx.execute({
      sql: "SELECT * FROM job_attempts WHERE collection_id=? AND state='running'",
      args: [id],
    });
    if (active.rows[0]) {
      const a = active.rows[0] as Data;
      assertLease(a, body.claim_token, actor);
      if (a.stage !== "filling")
        throw new CollectionError(
          "Submission may have started; reconcile receipt before marking expired",
          409,
        );
      await tx.execute({
        sql: "UPDATE job_attempts SET state='finished',outcome='skipped',reason_code='job_expired',notes=?,ended_at=?,evidence_json=?,version=version+1 WHERE id=?",
        args: [body.notes, now(), doc([body.evidence]), a.id],
      });
    }
    // Expiry is listing availability, never a rewrite of submission history.
    await tx.execute({
      sql: "UPDATE job_collection SET availability='expired',availability_checked_at=?,availability_evidence_json=?,updated_at=?,version=version+1 WHERE id=?",
      args: [
        now(),
        doc({ ...body.evidence, notes: body.notes, actor }),
        now(),
        id,
      ],
    });
    if (active.rows.length && j.status !== "applied")
      await summary(tx, id, "skipped", body.notes, actor);
    return { job: decodeCollection(await row(tx, "job_collection", id)) };
  });
}
