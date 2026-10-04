const output = document.querySelector("pre")!;
let report: unknown;
async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "diagnostics" });
  if (!response?.ok) throw Error(response?.error || "Diagnostics unavailable");
  report = response.data;
  output.textContent = JSON.stringify(report, null, 2);
  const status = response.data.compatibility?.status;
  document.querySelector("#compatibility-status")!.textContent =
    status === "verified"
      ? "Compatible · verified now"
      : status === "stale"
        ? "Compatible at last check · refresh needed"
        : status === "incompatible"
          ? "Update required · unsupported version"
          : status === "offline"
            ? "Unable to check · local work preserved"
            : "Compatibility has not been checked";
}
document
  .querySelector("#refresh")!
  .addEventListener("click", () =>
    refresh().catch((e) => (output.textContent = e.message)),
  );
document.querySelector("#download")!.addEventListener("click", async () => {
  await refresh();
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "jobs-workflow-diagnostics.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
void refresh().catch((e) => (output.textContent = e.message));

document.querySelector("#check")!.addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({ type: "checkCompatibility" });
  await refresh();
  if (!r?.ok)
    document.querySelector("#compatibility-status")!.textContent =
      r?.error || "Compatibility check failed";
});
