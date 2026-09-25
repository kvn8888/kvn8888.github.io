import { extractJobs, capturePage } from "./extract";
const win = window as Window & { __jobsUtility?: boolean };
if (!win.__jobsUtility) {
  win.__jobsUtility = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<void> | null = null;
  let fingerprint = "";
  let lastError: string | null = null;
  const send = (message: unknown) => chrome.runtime.sendMessage(message);
  async function performScan(force = false) {
    try {
      lastError = null;
      const context = await send({ type: "context" });
      if (!context?.ok) return;
      if (context.data.collect) {
        const jobs = extractJobs(document, location.href);
        const signature = JSON.stringify(
          jobs.map(
            ({ id, first_seen_at, last_seen_at, updated_at, ...rest }) => rest,
          ),
        );
        if (force || signature !== fingerprint) {
          if (jobs.length) {
            const r = await send({ type: "observed", jobs });
            if (r?.ok) fingerprint = signature;
            else throw Error(r?.error || "Job capture failed");
          }
        }
      }
      if (context.data.capture) {
        const response = await send({
          type: "snapshot",
          captureId: context.data.capture.capture_id,
          page: capturePage(document, location.href),
        });
        if (!response?.ok)
          throw Error(response?.error || "Section capture failed");
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Capture failed";
    }
  }
  function scan(force = false): Promise<void> {
    if (flight) return force ? flight.then(() => scan(true)) : flight;
    flight = performScan(force).finally(() => {
      flight = null;
    });
    return flight;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void scan(), 400);
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (const event of ["input", "change", "focusout"])
    document.addEventListener(event, schedule, true);
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target as Element;
      if (el?.closest('button,input[type="submit"],a')) void scan(true);
    },
    true,
  );
  document.addEventListener("submit", () => void scan(true), true);
  window.addEventListener("pagehide", () => void scan(true));
  window.addEventListener("popstate", schedule);
  setInterval(() => void scan(), 3000);
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "scan") {
      scan(true).then(() => respond({ ok: !lastError, error: lastError }));
      return true;
    }
    if (message.type === "readPage") {
      respond({
        jobs: extractJobs(document, location.href),
        page: capturePage(document, location.href),
      });
    }
  });
  void scan(true);
}
