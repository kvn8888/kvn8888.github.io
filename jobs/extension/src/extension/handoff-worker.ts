import { hostedRequest, type Connection } from "./hosted";
import { preflight } from "../shared/discovery";
import { runFrames } from "../../../handoff/src/browser.mjs";
import { parsePacket } from "../../../handoff/src/packet.mjs";
type Work = {
  id: string;
  token: string;
  handoffId: string;
  collectionId: string;
  collectionVersion: number;
  captureId: string;
  tabId?: number;
  stage: string;
  document: any;
  job?: any;
  error?: string;
  completion?: any;
  finalCapture?: any;
  packetIndex?: number;
};
export async function handoffWork(): Promise<Work | null> {
  return (
    ((await chrome.storage.local.get("handoffWork")).handoffWork as
      Work | undefined) || null
  );
}
async function store(work: Work | null) {
  await chrome.storage.local.set({ handoffWork: work });
}
function safe(w: Work | null) {
  if (!w) return null;
  const { token, completion, finalCapture, ...rest } = w;
  void token;
  return { ...rest, completion_pending: !!completion };
}
export async function heartbeatHandoff(connection?: Connection) {
  const w = await handoffWork();
  if (!w || !connection || !w.tabId || w.completion) return;
  try {
    const t = await chrome.tabs.get(w.tabId);
    if (
      !t.url ||
      !w.document.packets.some(
        (p: any) =>
          new URL(p.application_url).origin === new URL(t.url!).origin,
      )
    )
      return;
    await hostedRequest(
      connection,
      `/api/job-workflow/attempts/${w.id}/heartbeat`,
      "POST",
      {
        claim_token: w.token,
        ...(w.stage === "submit_started" ? { stage: "submit_started" } : {}),
      },
    );
    w.error = undefined;
  } catch (e) {
    w.error = e instanceof Error ? e.message : "Lease renewal failed";
  }
  await store(w);
}
export async function handoffHandle(m: any, connection?: Connection) {
  if (!connection)
    throw Error(
      "Connect the tracker in Settings first. Human handoffs require the extension credential.",
    );
  const api = (path: string, method = "GET", body?: unknown) =>
    hostedRequest(connection, "/api/job-workflow/" + path, method, body);
  let w = await handoffWork();
  if (m.type === "handoff-state") return { work: safe(w) };
  if (m.type === "handoff-list")
    return api("handoffs?offset=" + Math.max(0, Number(m.offset) || 0));
  if (m.type === "handoff-detail")
    return api("handoffs/" + encodeURIComponent(m.id));
  if (m.type === "handoff-claim") {
    if (w && w.handoffId !== m.id)
      throw Error("Finish or release your current handoff first.");
    await preflight(connection.baseUrl, true);
    if (!w) {
      const detail = await api("handoffs/" + encodeURIComponent(m.id));
      w = {
        id: crypto.randomUUID(),
        token: crypto.randomUUID() + crypto.randomUUID(),
        handoffId: m.id,
        collectionId: detail.job.id,
        collectionVersion: detail.job.version,
        captureId: detail.handoff.handoff_capture_id,
        stage: "filling",
        document: detail.document,
        job: detail.job,
      };
      await store(w);
    }
    try {
      await api("handoffs/" + encodeURIComponent(m.id) + "/claim", "POST", {
        id: w.id,
        version: w.collectionVersion,
        claim_token: w.token,
      });
      w.error = undefined;
      await store(w);
      return safe(w);
    } catch (e) {
      w.error = e instanceof Error ? e.message : "Claim failed";
      await store(w);
      throw e;
    }
  }
  if (!w) throw Error("Take a handoff first.");
  if (m.type === "handoff-check") {
    try {
      await api(`attempts/${w.id}/heartbeat`,"POST",{claim_token:w.token,...(w.stage==='submit_started'?{stage:'submit_started'}:{})});
      w.error=undefined;await store(w);return safe(w);
    } catch(e){w.error=e instanceof Error?e.message:'Ownership check failed';await store(w);throw e;}
  }

  const packet = () => {
    const i = Number(m.packetIndex || 0);
    if (!Number.isSafeInteger(i) || i < 0 || i >= w!.document.packets.length)
      throw Error("Choose a saved page");
    return parsePacket(w!.document.packets[i]);
  };
  if (m.type === "handoff-open") {
    if (w.error) throw Error(w.error);
    const t = await chrome.tabs.create({ url: packet().application_url });
    w.tabId = t.id;
    await store(w);
    return safe(w);
  }
  if (m.type === "handoff-restore") {
    if (w.completion)
      throw Error("A confirmed save is pending; retry it before editing.");
    if (!w.tabId) throw Error("Open the application from this handoff first.");
    if (m.confirmPage !== true)
      throw Error(
        "Confirm the correct employer, role and application step before restoring.",
      );
    await api(`attempts/${w.id}/heartbeat`, "POST", { claim_token: w.token });
    const t = await chrome.tabs.get(w.tabId),
      p = packet();
    if (!t.url || new URL(t.url).origin !== new URL(p.application_url).origin)
      throw Error(
        "Application origin changed. Return to the saved employer page.",
      );
    w.packetIndex = Number(m.packetIndex || 0);
    await store(w);
    await watchHandoffTab(w.tabId);
    return runFrames(t, "restore", p);
  }
  if (m.type === "handoff-submit-start") {
    if (w.completion) throw Error("Completion is already pending");
    const alreadyStarted = w.stage === "submit_started";
    w.stage = "submit_started";
    await store(w);
    await api(`attempts/${w.id}/heartbeat`, "POST", {
      claim_token: w.token,
      stage: "submit_started",
    });
    if (w.tabId && !alreadyStarted) {
      try {
        const t = await chrome.tabs.get(w.tabId);
        const current = await runFrames(t, "capture");
        if (
          w.document.packets.some(
            (p: any) =>
              new URL(current.packet.application_url).origin ===
              new URL(p.application_url).origin,
          )
        ) {
          w.document.human_final_page = current.packet;
          w.document.gaps = [
            ...(w.document.gaps || []),
            "Only the current human step was recaptured before submission; other packets retain agent-observed values.",
          ];
          await store(w);
        }
      } catch {
        w.document.gaps = [
          ...(w.document.gaps || []),
          "Could not recapture the final human step. Manual changes may be missing.",
        ];
        await store(w);
      }
    }
    return safe(w);
  }
  if (m.type === "handoff-complete") {
    if (m.confirm !== true)
      throw Error(
        "Confirm that you personally submitted and saw confirmation.",
      );
    // Retain the exact payload and original claim token before network I/O for safe retries after timeout.
    if (!w.finalCapture) {
      w.finalCapture = {
        id: w.id,
        capture_session_id: w.id,
        revision: 1,
        collection_id: w.collectionId,
        attempt_id: w.id,
        state: "finished",
        captured_at: new Date().toISOString(),
        document: {
          ...w.document,
          source_handoff_capture_id: w.captureId,
          gaps: [
            ...(w.document.gaps || []),
            "Coverage is limited to observed pages; human edits after the final capture may be missing.",
          ],
        },
      };
      await store(w);
    }
    await api("captures", "POST", w.finalCapture);
    if (!w.completion) {
      w.completion = {
        claim_token: w.token,
        confirmed: true,
        confirmation_kind: "user_confirmed",
        submitted_at: new Date().toISOString(),
        capture_id: w.finalCapture.id,
        resolve_blocker_ids: [w.handoffId],
        evidence: [
          {
            kind: "human_assertion",
            notes: String(
              m.notes ||
                "I submitted on the employer site and saw confirmation",
            ).slice(0, 50000),
          },
        ],
      };
      await store(w);
    }
    const result = await api(`attempts/${w.id}/complete`, "POST", w.completion);
    const saved = await hostedRequest(
      connection,
      "/api/jobs/" + result.application_id,
    );
    if (saved.job?.id !== result.application_id)
      throw Error("Readback failed; retry completion to reconcile.");
    await store(null);
    return result;
  }
  if (m.type === "handoff-release") {
    if (w.completion)
      throw Error("A completion write is pending; retry it before releasing.");
    await api(`attempts/${w.id}/outcome`, "POST", {
      claim_token: w.token,
      outcome:
        w.stage === "submit_started" ? "submission_unknown" : "cancelled",
      notes:
        w.stage === "submit_started"
          ? "Human submission result requires reconciliation"
          : "Human returned the handoff to the queue",
    });
    await store(null);
    return true;
  }
  if (m.type === "handoff-recover") {
    if (w.completion) throw Error("Retry the pending confirmed save first");
    const detail = await api("jobs/" + w.collectionId),
      attempt = detail.attempts.find((a: any) => a.id === w!.id);
    if (!attempt) {
      await store(null);
      return true;
    }
    if (attempt.state === "running") {
      if (w.stage === "submit_started")
        await api(`attempts/${w.id}/outcome`, "POST", {
          claim_token: w.token,
          outcome: "submission_unknown",
          notes:
            "Human session interrupted after submission intent; reconcile receipt before retry",
        });
      else
        await api(`attempts/${w.id}/recover`, "POST", {
          version: attempt.version,
        });
    } else if (
      w.stage === "submit_started" &&
      attempt.outcome !== "submitted" &&
      attempt.outcome !== "submission_unknown"
    )
      throw Error(
        "Local submission intent conflicts with recovered server state; reconcile the employer receipt in the portal first.",
      );
    await store(null);
    return true;
  }
  if (m.type === "handoff-forget-failed-claim") {
    const d = await api("jobs/" + w.collectionId);
    if (d.attempts.some((a: any) => a.id === w!.id))
      throw Error(
        "Attempt exists; finish, release or recover it through the workflow before clearing local state.",
      );
    await store(null);
    return true;
  }
  throw Error("Unknown handoff action");
}

// Observe trusted final-submit interactions; never click a control or capture its values.
export async function watchHandoffTab(tabId: number) {
  const w = await handoffWork();
  if (!w || w.tabId !== tabId) return;
  const t = await chrome.tabs.get(tabId);
  if (
    !t.url ||
    !w.document.packets.some(
      (p: any) => new URL(p.application_url).origin === new URL(t.url!).origin,
    )
  )
    return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const win = window as Window & { __jobsHandoffSubmitWatch?: boolean };
        if (win.__jobsHandoffSubmitWatch) return;
        win.__jobsHandoffSubmitWatch = true;
        const record = (event: Event) => {
          if (!event.isTrusted) return;
          const target =
            event.type === "submit"
              ? (event as SubmitEvent).submitter
              : (event.target as Element)?.closest(
                  'button,input[type="submit"]',
                );
          if (!target) return;
          const label = (
            target.textContent ||
            (target as HTMLInputElement).value ||
            target.getAttribute("aria-label") ||
            ""
          ).trim();
          if (
            /^(submit|submit application|send application|finish application)$/i.test(
              label,
            )
          )
            void chrome.runtime.sendMessage({
              type: "handoff-submit-observed",
            });
        };
        document.addEventListener("click", record, true);
        document.addEventListener("submit", record, true);
      },
    });
  } catch {
    /* Permission may not be granted until Restore. The explicit submit-start control remains available. */
  }
}

export async function handoffBadge(connection?: Connection) {
  if (!connection) return;
  try {
    const list = await hostedRequest(connection, "/api/job-workflow/handoffs");
    await chrome.action.setBadgeText({
      text: list.total ? String(list.total) : "",
    });
    await chrome.action.setBadgeBackgroundColor({ color: "#ad4d1f" });
    await chrome.action.setTitle({
      title: `Jobs Utility · ${list.total} handoffs waiting`,
    });
  } catch {
    await chrome.action.setBadgeText({ text: "?" });
  }
}
