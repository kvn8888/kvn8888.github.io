import { test } from "node:test";
import assert from "node:assert/strict";
import { auditCollection, maintainCollection } from "../cli/collection.mjs";
test("collection audit treats incompleteness as enrichment and title matches only as candidates", () => {
  const rows = [
    {
      id: "one",
      company: "Example",
      role: "Engineer",
      description_status: "missing",
    },
    {
      id: "two",
      company: "Example",
      role: "Engineer",
      description_status: "partial",
    },
  ];
  const r = auditCollection(rows);
  assert.equal(r.read_only, true);
  assert.equal(r.needs_enrichment.length, 2);
  assert.deepEqual(r.possible_duplicates, [["one", "two"]]);
  assert.equal("delete" in r, false);
});
test("archive uses the fetched version, demands an ID/reason, and verifies readback", async () => {
  let row = {
    id: "11111111-1111-4111-8111-111111111111",
    version: 8,
    archived_at: null,
    status: "pending",
  };
  const methods = [];
  const fetcher = async (url, options) => {
    methods.push(options.method);
    if (options.method === "PATCH") {
      assert.equal(options.headers["If-Match"], '"8"');
      row = { ...row, ...JSON.parse(options.body), version: 9 };
    }
    return new Response(JSON.stringify({ job: row }));
  };
  const r = await maintainCollection({
    base: "https://example.com",
    key: "private",
    id: row.id,
    reason: "Unrelated role",
    action: "archive",
    fetcher,
  });
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
  assert.equal(r.readback_verified, true);
  assert.equal(r.status, "pending");
  await assert.rejects(
    maintainCollection({ key: "private", action: "archive", fetcher }),
    /UUID/,
  );
});
test("maintenance refuses conflicts without blindly overwriting a newer record", async () => {
  let n = 0;
  const fetcher = async () => {
    n++;
    return n === 1
      ? new Response(JSON.stringify({ job: { version: 1 } }))
      : new Response(JSON.stringify({ error: "Record changed" }), {
          status: 412,
        });
  };
  await assert.rejects(
    maintainCollection({
      base: "https://example.com",
      key: "private",
      id: "11111111-1111-4111-8111-111111111111",
      reason: "Reviewed",
      action: "archive",
      fetcher,
    }),
    /412/,
  );
  assert.equal(n, 2);
});
