import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { score, include } from "../lib/rubric.js";

test("score follows the rubric", () => {
  // Borges: Y,Y,~ popular,Y small audience,Y fit -> 1+1+0.5+1
  assert.equal(score({ historically_significant: "Y", critically_acclaimed: "Y", exceptionally_popular: "~", beloved_small_audience: "Y", rationalist_fit: "Y" }), 3.5);
  // Famous author, minor book; popular only
  assert.equal(score({ historically_significant: "~", critically_acclaimed: "", exceptionally_popular: "Y", beloved_small_audience: "", rationalist_fit: "" }), 1);
  assert.equal(score({ historically_significant: "", critically_acclaimed: "~", exceptionally_popular: "", beloved_small_audience: "~", rationalist_fit: "~" }), 1.25);
});

test("include rules", () => {
  const empty = { historically_significant: "", critically_acclaimed: "", exceptionally_popular: "", beloved_small_audience: "", rationalist_fit: "" };
  assert.equal(include({ ...empty, category: "Fiction", secondary_category: "Friend of Lighthaven" }).include, "Y");
  // Popular only (0.5): no longer enough
  assert.equal(include({ ...empty, category: "Fiction", secondary_category: "", exceptionally_popular: "Y" }).include, "N");
  // 1.5 exactly: included
  assert.equal(include({ ...empty, category: "Fiction", secondary_category: "", critically_acclaimed: "Y", exceptionally_popular: "Y" }).include, "Y");
  assert.equal(include({ ...empty, category: "Fiction", secondary_category: "" }).include, "N");
});

test("handler: researches, scores and appends a row", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.ANTHROPIC_API_KEY = "test";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@x.iam.gserviceaccount.com";
  process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n");

  const calls = [];
  let claudeCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
    url = String(url);
    if (url.includes("oauth2")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("anthropic")) {
      claudeCalls++;
      const body = JSON.parse(init.body);
      assert.match(body.messages[0].content, /Eye of the World/); // inventory passed through
      assert.match(body.messages[0].content, /assigned primary category "Sociology\/History"/);
      assert.ok(body.tools[1].input_schema.properties.category.enum.includes("Self-Help: Mind & Philosophy"));
      if (claudeCalls === 1) return json({ stop_reason: "pause_turn", content: [{ type: "text", text: "searching" }] });
      return json({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "record_book", input: {
        title: "The Great Hunt", author: "Robert Jordan", year: "1990", is_fiction: true, category: "Fiction", secondary_category: "",
        historically_significant: "~", critically_acclaimed: "", exceptionally_popular: "Y", beloved_small_audience: "", rationalist_fit: "",
        goodreads: "4.24 / 300k", kill: "", kill_reason: "", already_in_inventory: "1", confidence: "High", notes: "WoT #2", reasoning: "r",
      } }] });
    }
    if (url.includes("/values/") && url.includes("Books-")) return json({ values: [["#", "Title", "*", "", "", "", "", "", "", "", "", "", "", "Author / Editor"], ["", "The Eye of the World", "", "", "", "", "", "", "", "", "", "", "", "Robert Jordan"]] });
    if (url.includes("/values/") && url.includes("Submissions") && !url.includes(":append")) return json({ values: [] });
    if (url.includes("fields=sheets")) return json({ sheets: [{ properties: { title: "Books- Before" } }] });
    if (url.includes(":batchUpdate")) return json({});
    if (url.includes(":append")) return json({});
    throw new Error("unexpected " + url);
  };

  const { default: handler } = await import("../api/submit.js");
  let status, payload;
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; return this; }, setHeader() {} };
  await handler({ method: "POST", body: { title: "great hunt", author: "jordan", location: "Building A", count: "1", category: "Sociology/History", secondary: "Not a category" } }, res);

  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.saved, true, payload.saveError);
  assert.equal(payload.book.score, 1);
  assert.equal(payload.book.include, "N");
  assert.equal(payload.book.category, "Sociology/History"); // volunteer override wins
  assert.equal(payload.book.secondary_category, ""); // invalid override ignored
  assert.equal(claudeCalls, 2); // pause_turn was resumed

  const appends = calls.filter((c) => c.url.includes(":append"));
  assert.equal(appends.length, 2); // header row for new tab + book row
  const row = JSON.parse(appends[1].init.body).values[0];
  assert.equal(row[1], "The Great Hunt");
  assert.equal(row[6], "Building A");
  assert.equal(row[10], 1);
  assert.ok(appends[0].url.includes("valueInputOption=RAW"));
});

test("categories endpoint lists the new categories", async () => {
  const { default: handler } = await import("../api/categories.js");
  let out;
  handler({}, { setHeader() {}, status() { return this; }, json(p) { out = p; } });
  for (const n of ["Sociology/History", "History of Science", "History of Industry & WW2", "Business Self-Help", "Self-Help", "Self-Help: Mind & Philosophy"])
    assert.ok(out.some((c) => c.name === n), n);
  assert.ok(!out.some((c) => c.name === "History"));
});

test("parallel first submissions don't fail when both try to create the tab", async () => {
  const { ensureTab } = await import("../lib/sheets.js");
  let appended = 0;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d });
    if (url.includes("oauth2")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("fields=sheets")) return json({ sheets: [] });
    if (url.includes(":batchUpdate")) return json({ error: { message: 'A sheet with the name "Submissions" already exists.' } }, 400);
    if (url.includes(":append")) { appended++; return json({}); }
    throw new Error("unexpected " + url);
  };
  await ensureTab("Submissions", ["h"]);
  assert.equal(appended, 0); // the other request writes the header
});
