// Explicit, version-checked maintenance. Incomplete leads are never deleted or auto-dismissed.
export function auditCollection(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    if (!job.company || !job.role) continue;
    const key = [job.company, job.role]
      .map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .join(":");
    groups.set(key, [...(groups.get(key) || []), job.id]);
  }
  return {
    read_only: true,
    total: jobs.length,
    needs_enrichment: jobs
      .filter(
        (j) =>
          !j.archived_at &&
          (!j.company ||
            !j.role ||
            j.description_status !== "full" ||
            j.resolution_status === "unresolved"),
      )
      .map((j) => ({
        id: j.id,
        source: j.source,
        company: j.company,
        role: j.role,
        missing_fields: [
          "company",
          "role",
          "location",
          "work_mode",
          "employment_type",
        ].filter((k) => !j[k]),
        description_status: j.description_status,
        resolution_status: j.resolution_status,
      })),
    possible_duplicates: [...groups.values()].filter((ids) => ids.length > 1),
    rules: [
      "Incomplete leads are valid. Enrich rather than delete.",
      "Possible duplicates share a company and title only; verify source and employer IDs before archiving.",
      "Archive only explicitly selected records with a reason. Restore retains workflow status.",
    ],
  };
}
export async function maintainCollection({
  base,
  key,
  action,
  id,
  reason,
  fetcher = fetch,
}) {
  if (!key)
    throw Error(
      "Configure JOBS_API_KEY or JOBS_WORKFLOW_KEY_FILE; never put a key in command arguments.",
    );
  async function request(path, method = "GET", body, version) {
    const response = await fetcher(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + key,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(version ? { "If-Match": `"${version}"` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(
        `HTTP ${response.status}: ${data.error || "Collection request failed"}`,
      );
    return data;
  }
  if (action === "audit") {
    let cursor = null;
    const jobs = [];
    do {
      const params = new URLSearchParams({ limit: "100", archived: "all" });
      if (cursor) params.set("cursor", cursor);
      const page = await request("/api/job-collection?" + params);
      jobs.push(...page.jobs);
      cursor = page.next_cursor;
    } while (cursor);
    return auditCollection(jobs);
  }
  if (!["archive", "restore"].includes(action))
    throw Error(
      "Use collection audit, archive --id UUID --reason TEXT, or restore --id UUID --reason TEXT",
    );
  if (!/^[a-f0-9-]{36}$/i.test(id || ""))
    throw Error("An explicit collection UUID is required");
  if (!reason?.trim()) throw Error("A reason is required");
  const path = "/api/job-collection/" + id,
    current = (await request(path)).job;
  const archived_at = action === "archive" ? new Date().toISOString() : null;
  await request(
    path,
    "PATCH",
    { archived_at, status_notes: reason.trim() },
    current.version,
  );
  const saved = (await request(path)).job;
  if (saved.archived_at !== archived_at)
    throw Error("Record changed after maintenance; reread before retrying.");
  return {
    action,
    id: saved.id,
    archived_at: saved.archived_at,
    version: saved.version,
    status: saved.status,
    readback_verified: true,
  };
}
