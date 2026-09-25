import { publicWorkflowResponse, isPublicWorkflowRequest } from '@/lib/jobWorkflowPublic'
import {jobWorkflowContract} from '@/lib/jobWorkflowContract'
import { NextResponse } from "next/server";
import { getJobsIdentity } from "@/lib/jobsRequestAuth";
import { getJobsDb, ensureJobsSchema } from "@/lib/jobsDb";
import { ensureCollectionSchema } from "@/lib/jobCollectionSchema";
import { ensureWorkflowSchema } from "@/lib/jobWorkflowSchema";
import { CollectionError, readCollectionBody } from "@/lib/jobCollection";
import { collectionFailure } from "@/lib/jobCollectionHttp";
import {
  claimAttempt,
  heartbeat,
  recoverAttempt,
  finishOutcome,
  saveCapture,
  resolveBlocker,
  completeAttempt,
  workflowDetail,
  workflowList,
  workflowMetrics,
  getCapture,
  object,
} from "@/lib/jobWorkflow";

export const runtime = "nodejs";
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    if (isPublicWorkflowRequest(new URL(req.url).pathname, req.method)) {
      return (await publicWorkflowResponse(req, (await context.params).path.join('/')))!
    }
    const actor = await getJobsIdentity(req);
    if (!actor) throw new CollectionError("Unauthorized", 401);
    const db = await getJobsDb();
    await ensureJobsSchema(db);
    await ensureCollectionSchema(db);
    await ensureWorkflowSchema(db);
    const parts = (await context.params).path;
    const path = parts.join("/");
    const isGet = req.method === "GET";
    let result: unknown;
    if (isGet && path === "contract") result = jobWorkflowContract;
    else if (isGet && path === "connection")
      result = {
        ok: true,
        workflow_version: 1,
        access: actor === "tracker-reader" ? "read" : "write",
      };
    else if (isGet && path === "metrics") result = await workflowMetrics(db);
    else if (isGet && parts[0] === "captures" && parts.length === 2)
      result = await getCapture(db, parts[1]);
    else if (isGet && parts[0] === "jobs" && parts.length === 2)
      result = await workflowDetail(db, parts[1]);
    else if (isGet && ["blockers", "attempts"].includes(path))
      result = await workflowList(db, path, new URL(req.url).searchParams);
    else if (req.method === "POST") {
      const body = object(await readCollectionBody(req));
      if (path === "attempts") result = await claimAttempt(db, body, actor);
      else if (path === "captures") result = await saveCapture(db, body, actor);
      else if (
        parts[0] === "attempts" &&
        parts.length === 3 &&
        parts[2] === "heartbeat"
      )
        result = await heartbeat(db, parts[1], body, actor);
      else if (
        parts[0] === "attempts" &&
        parts.length === 3 &&
        parts[2] === "recover"
      )
        result = await recoverAttempt(db, parts[1], body, actor);
      else if (
        parts[0] === "attempts" &&
        parts.length === 3 &&
        parts[2] === "outcome"
      )
        result = await finishOutcome(db, parts[1], body, actor);
      else if (
        parts[0] === "attempts" &&
        parts.length === 3 &&
        parts[2] === "complete"
      )
        result = await completeAttempt(db, parts[1], body, actor);
      else if (
        parts[0] === "blockers" &&
        parts.length === 3 &&
        parts[2] === "resolve"
      )
        result = await resolveBlocker(db, parts[1], body, actor);
      else throw new CollectionError("Not found", 404);
    } else throw new CollectionError("Not found", 404);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return collectionFailure(e);
  }
}
export const GET = handle;
export const POST = handle;

export const HEAD = handle;
