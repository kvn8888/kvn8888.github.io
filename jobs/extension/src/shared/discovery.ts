import { CLIENT_VERSION } from "./version";
export { CLIENT_VERSION } from "./version";
type Discovery = {
  revision: string;
  api_version: string;
  supported_clients: { extension: { min: string; max_major: number } };
  links: { changes: string; guide: string };
};
let last: { base: string; at: number; data: Discovery } | undefined;
let failedBase: string | undefined;
export function supportsClient(d: Discovery) {
  const rule = d?.supported_clients?.extension;
  if (!rule) return false;
  const a = CLIENT_VERSION.split(".").map(Number),
    b = rule.min.split(".").map(Number);
  return (
    a[0] <= rule.max_major &&
    (a[0] > b[0] ||
      (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))))
  );
}
export async function preflight(base: string, force = false) {
  if (
    !force &&
    last?.base === base &&
    !failedBase &&
    supportsClient(last.data) &&
    Date.now() - last.at < 60000
  )
    return last.data;
  let data: Discovery;
  try {
    const response = await fetch(base + "/api/job-workflow/discovery", {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    data = await response.json();
  } catch {
    failedBase = base;
    if (last?.base !== base) last = undefined;
    throw Error(
      "Cannot verify workflow compatibility. Your local work is preserved; reconnect before starting new work.",
    );
  }
  last = { base, at: Date.now(), data };
  failedBase = undefined;
  if (!supportsClient(data))
    throw Error(
      "This extension is incompatible with the hosted workflow. Update it before starting new work; existing drafts are preserved.",
    );
  return data;
}
export function compatibilitySnapshot() {
  if (!last && !failedBase) return null;
  const supported = last ? supportsClient(last.data) : null;
  const status = failedBase
    ? "offline"
    : !supported
      ? "incompatible"
      : Date.now() - last!.at >= 60000
        ? "stale"
        : "verified";
  return {
    checked_at: last ? new Date(last.at).toISOString() : null,
    api_version: last?.data.api_version ?? null,
    revision: last?.data.revision ?? null,
    compatible: status === "verified",
    supported,
    status,
  };
}
