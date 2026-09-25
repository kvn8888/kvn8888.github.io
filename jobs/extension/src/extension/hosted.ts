import { preflight } from '../shared/discovery';
import type { operations } from '../shared/api-types';
type ClaimBody = operations['claim']['requestBody']['content']['application/json'];
import { jobSchema, type Job } from "../shared/model";
export type Connection = { baseUrl: string; apiKey: string };
export async function hostedRequest(
  connection: Connection,
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const response = await fetch(connection.baseUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const e = new Error(data.error || `HTTP ${response.status}`) as Error & {
      status: number;
    };
    e.status = response.status;
    throw e;
  }
  return data;
}
export function decodeJob(value: Record<string, unknown>): Job {
  const template = jobSchema.parse({
    id: value.id,
    identity_key: value.identity_key,
    source: value.source,
    source_url: value.source_url,
    first_seen_at: value.first_seen_at,
    last_seen_at: value.last_seen_at,
    updated_at: value.updated_at,
  });
  for (const key of Object.keys(template) as (keyof Job)[]) {
    if (key in value) {
      const v = value[key];
      (template as any)[key] =
        key.endsWith("_json") && typeof v !== "string" ? JSON.stringify(v) : v;
    }
  }
  return jobSchema.parse(template);
}
export async function collectHosted(
  connection: Connection,
  job: Job,
): Promise<Job> {
  const { updated_at, ...create } = job;
  void updated_at;
  const result = await hostedRequest(
    connection,
    "/api/job-collection",
    "POST",
    create,
  );
  if (result.created) return decodeJob(result.job);
  // POST is create-or-find. Enrich the returned canonical ID using its current version.
  let current = result.job;
  for (let retry = 0; retry < 3; retry++) {
    const patch: Record<string, unknown> = {};
    const priorEdits = current.metadata_json?.user_edited_fields || [];
    const edits = JSON.parse(job.metadata_json).user_edited_fields || [];
    for (const [key, value] of Object.entries(create)) {
      if (
        [
          "id",
          "identity_key",
          "source",
          "first_seen_at",
          "archived_at",
        ].includes(key) ||
        value === null
      )
        continue;
      if (priorEdits.includes(key) && !edits.includes(key)) continue;
      if (
        key === "description" &&
        current.description_status === "full" &&
        job.description_status !== "full"
      )
        continue;
      if (
        key === "description_status" &&
        current.description_status === "full" &&
        job.description_status !== "full"
      )
        continue;
      if (
        key === "resolution_status" &&
        current.application_url &&
        !job.application_url
      )
        continue;
      if (key === "last_seen_at" && String(value) <= current.last_seen_at)
        continue;
      if (key.endsWith("_json")) {
        const parsed = JSON.parse(String(value));
        if (JSON.stringify(parsed) !== JSON.stringify(current[key]))
          patch[key] = parsed;
      } else if (value !== current[key]) patch[key] = value;
    }
    if (patch.description && current.description_status === "full")
      patch.description_status = "full";
    if (!Object.keys(patch).length) return decodeJob(current);
    try {
      return decodeJob(
        (
          await hostedRequest(
            connection,
            `/api/job-collection/${current.id}`,
            "PATCH",
            patch,
            { "If-Match": `"${current.version}"` },
          )
        ).job,
      );
    } catch (e) {
      if ((e as any).status !== 412) throw e;
      current = (
        await hostedRequest(connection, `/api/job-collection/${current.id}`)
      ).job;
    }
  }
  throw Error(
    "Opportunity changed repeatedly. Retry sync after other edits finish.",
  );
}
export async function submitHosted(
  connection: Connection,
  payload: any,
  claimToken: string,
) {
  const job = await collectHosted(connection, payload.job);
  const history = await hostedRequest(connection, '/api/job-workflow/jobs/'+encodeURIComponent(job.id));
  if (!history.attempts?.some((a: {id:string}) => a.id === payload.capture_id)) await preflight(connection.baseUrl, true);
  const document = { ...payload, job: { ...payload.job, id: job.id } };
  const captureId = payload.capture_id;
  await hostedRequest(connection, "/api/job-workflow/captures", "POST", {
    id: captureId,
    capture_session_id: captureId,
    revision: payload.capture_revision || 1,
    collection_id: job.id,
    state: "finished",
    captured_at: payload.finished_at,
    document,
  });
  const current = (
    await hostedRequest(connection, `/api/job-collection/${job.id}`)
  ).job;
  await hostedRequest(connection, "/api/job-workflow/attempts", "POST", {
    id: captureId,
    collection_id: job.id,
    version: current.version,
    claim_token: claimToken,
    worker_id: "chrome-extension",
    manual: true,
  } satisfies ClaimBody);
  const result = await hostedRequest(
    connection,
    `/api/job-workflow/attempts/${captureId}/complete`,
    "POST",
    {
      claim_token: claimToken,
      confirmed: true,
      confirmation_kind: "user_confirmed",
      submitted_at: payload.submitted_at,
      capture_id: captureId,
      resolve_blocker_ids: [],
    },
  );
  const readback = await hostedRequest(
    connection,
    `/api/jobs/${result.application_id}`,
  );
  if (Number(readback.job?.id) !== Number(result.application_id))
    throw Error("Tracker readback did not match the saved application");
  return { id: result.application_id, replayed: result.replayed };
}

export async function saveDraftHosted(connection: Connection, payload: any) {
  const job = await collectHosted(connection, payload.job);
  return hostedRequest(connection, "/api/job-workflow/captures", "POST", {
    id: payload.id,
    capture_session_id: payload.capture_id,
    revision: payload.revision,
    collection_id: job.id,
    state: "finished",
    captured_at: payload.captured_at,
    document: { ...payload.document, job: { ...payload.job, id: job.id } },
  });
}
