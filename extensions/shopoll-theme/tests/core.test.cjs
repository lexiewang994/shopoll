const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const core = require("../assets/shopoll-runtime.js");

test("theme startup loader stays below Shopify's 10 KB asset threshold", () => {
  const loader = fs.readFileSync(path.join(__dirname, "../assets/shopoll.js"));
  assert.ok(loader.byteLength < 10_000, `raw loader is ${loader.byteLength} bytes`);
  assert.ok(zlib.gzipSync(loader).byteLength < 10 * 1024, "gzip loader exceeds 10 KB");
});

test("rejects insecure remote API origins", () => {
  assert.equal(core.sanitizeBase("http://example.com/api", "https://shop.example"), "");
  assert.equal(core.sanitizeBase("/apps/shopoll/api/public/", "https://shop.example"), "/apps/shopoll/api/public");
  assert.equal(core.sanitizeBase("https://poll.example/api/", "https://shop.example"), "https://poll.example/api");
});

test("mobile exit intent uses the configured fallback", () => {
  const trigger = core.normalizeTrigger(
    { triggerMode: "exit", mobileFallback: "scroll", mobileScrollPercent: "65" },
    {},
    true,
    "popup",
  );
  assert.deepEqual(trigger, { type: "scroll", delayMs: 12000, scrollPercent: 65 });
});

test("branch rules can skip or complete", () => {
  const questions = [
    { id: "a", logic: [{ operator: "equals", value: "yes", action: "go_to", target: "c" }] },
    { id: "b" },
    { id: "c", next: "complete" },
  ];
  assert.deepEqual(core.resolveNext(questions[0], "yes", questions), { nextQuestionId: "c" });
  assert.deepEqual(core.resolveNext(questions[2], "anything", questions), { complete: true });
});

test("unknown locales fall back to English", () => {
  assert.equal(core.textFor({ en: "Hello", de: "Hallo" }, "ja"), "Hello");
});

test("idempotency hashes include skipped optional answers", () => {
  assert.equal(core.stableHash(undefined), core.stableHash(undefined));
  assert.notEqual(core.stableHash(undefined), core.stableHash(null));
});
