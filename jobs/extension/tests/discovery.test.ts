import test from "node:test";
import assert from "node:assert/strict";
import { preflight, compatibilitySnapshot } from "../src/shared/discovery";
import { CLIENT_VERSION } from "../src/shared/version";
test("compatibility distinguishes stale, offline and unsupported without permitting unverified new work", async () => {
  const savedFetch = globalThis.fetch,
    clock = Date.now;
  let now = 100000;
  const discovery = {
    revision: "fixture",
    api_version: "1.2.0",
    supported_clients: { extension: { min: CLIENT_VERSION, max_major: 0 } },
    links: { guide: "fixture", changes: "fixture" },
  };
  Date.now = () => now;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(discovery), { status: 200 });
    await preflight("https://fixture.invalid", true);
    assert.equal(compatibilitySnapshot()?.status, "verified");
    assert.equal(compatibilitySnapshot()?.compatible, true);
    now += 61000;
    assert.equal(compatibilitySnapshot()?.status, "stale");
    assert.equal(compatibilitySnapshot()?.supported, true);
    assert.equal(compatibilitySnapshot()?.compatible, false);
    globalThis.fetch = async () => {
      throw Error("offline");
    };
    await assert.rejects(
      preflight("https://fixture.invalid", true),
      /Cannot verify/,
    );
    assert.equal(compatibilitySnapshot()?.status, "offline");
    assert.equal(compatibilitySnapshot()?.supported, true);
    assert.equal(compatibilitySnapshot()?.compatible, false);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ...discovery,
          supported_clients: { extension: { min: "99.0.0", max_major: 99 } },
        }),
      );
    await assert.rejects(
      preflight("https://fixture.invalid", true),
      /incompatible/,
    );
    assert.equal(compatibilitySnapshot()?.status, "incompatible");
    assert.equal(compatibilitySnapshot()?.supported, false);
    await assert.rejects(
      preflight("https://fixture.invalid"),
      /incompatible/,
      "Unsupported cached results must not allow a new attempt",
    );
    globalThis.fetch = async () => new Response(JSON.stringify(discovery));
    await preflight("https://fixture.invalid", true);
    assert.equal(compatibilitySnapshot()?.status, "verified");
  } finally {
    globalThis.fetch = savedFetch;
    Date.now = clock;
  }
});
