import { judgeBook } from "../lib/claude.js";
import { score, include, toRow, SHEET_HEADERS } from "../lib/rubric.js";
import { ensureTab, appendRow, inventory, sheetUrl } from "../lib/sheets.js";

const INVENTORY_TAB = () => process.env.INVENTORY_TAB || "Books- Before";
const SUBMISSIONS_TAB = () => process.env.SUBMISSIONS_TAB || "Submissions";

const clean = (s, n = 300) => String(s ?? "").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const submission = {
    title: clean(body.title),
    author: clean(body.author),
    location: clean(body.location, 100),
    count: clean(body.count, 10) || "1",
    notes: clean(body.notes, 1000),
  };
  if (!submission.title) return res.status(400).json({ error: "Title is required." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set." });

  try {
    const inv = await inventory(INVENTORY_TAB(), SUBMISSIONS_TAB());
    const b = await judgeBook(submission, inv);
    b.score = score(b);
    Object.assign(b, include(b));

    let saved = false;
    let saveError = null;
    try {
      await ensureTab(SUBMISSIONS_TAB(), SHEET_HEADERS);
      const when = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
      await appendRow(SUBMISSIONS_TAB(), toRow(b, submission, when));
      saved = true;
    } catch (e) {
      saveError = e.message;
    }
    return res.status(200).json({ book: b, saved, saveError, sheetUrl: sheetUrl(), tab: SUBMISSIONS_TAB() });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: e.message });
  }
}
