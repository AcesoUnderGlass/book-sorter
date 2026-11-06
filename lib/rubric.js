// Scoring and categorization rules for the Lighthaven library.
// Edit this file to change how books are judged; the prompt and the score
// formula both live here so they stay in sync.

export const CATEGORIES = [
  ["Fiction", "Novels, short stories, myth & folklore, manga"],
  ["Poetry & Drama", "Poetry, plays, screenplays"],
  ["Children's", "Children's books"],
  ["Friend of Lighthaven", "Written by someone in or closely tied to the rationalist/EA community. Takes priority over genre; genre goes in Secondary. Rationalist-adjacent authors (e.g. Caplan, Tetlock) get genre as primary and Friend of Lighthaven as secondary, flagged as a judgment call."],
  ["Science + Technology", "Science, math, computing, engineering, academic psychology/cognitive science (history of science has its own category)"],
  ["Sociology/History", "Sociology, anthropology, social psychology, general history"],
  ["Politics & Economics", "Economics, political theory, policy, American founding-era political writing"],
  ["Philosophy", "Philosophy"],
  ["Religion & Spirituality", "Religion, spirituality, meditation, astrology"],
  ["Business & Management", "Business, management, careers, product/teamwork methods"],
  ["Arts & Design", "Visual art, design, typography, data visualization, film, architecture"],
  ["Essays & Writing", "Essay collections, literary criticism, journalism anthologies, books about writing"],
  ["Biography & Memoir", "Biography and memoir"],
  ["Self-Help & Health", "Self-help, parenting, diet, nutrition, health"],
  ["Language & Reference", "Dictionaries, language learning, proverbs, word books"],
  ["Puzzles & Games", "Puzzle books and games"],
  ["Periodicals", "Magazines and journals"],
  ["Textbook", "Textbooks that are currently best in class. Dated textbooks go under their subject (or History of Science if they're now primary sources)"],
  ["AI", "Artificial intelligence, AI safety and alignment (by authors outside the community)"],
  ["Humor", "Humor"],
  ["History of Science", "History of science, math, medicine, and research institutions/labs, plus primary sources (e.g. Principia, Origin of Species); scientist biographies go here as Secondary"],
  ["Needs check", "Title known but can't verify what it is"],
];

export const CATEGORY_NAMES = CATEGORIES.map(([n]) => n);

export const SYSTEM_PROMPT = `You catalog books for the library at Lighthaven, a Berkeley campus run by Lightcone Infrastructure that hosts the rationalist and effective-altruist community (LessWrong, AI safety researchers, forecasters, progress-studies people).

A volunteer submits a book. Identify it, research it with web search, then call record_book exactly once.

## Categories
Pick a primary category and, if useful, a secondary one, from this list only:
${CATEGORIES.map(([n, d]) => `- ${n}: ${d}`).join("\n")}

## Criteria
Mark each "Y", "~" (borderline / partial) or "" (no).

1. Historically significant: the book itself was influential, a landmark, or started something (a genre, a movement, a famous series). A minor book by a historically significant author gets "~", not "Y". Fame in another field does not count, and fame does not pass to relatives.
2. Critically acclaimed: major prizes (Hugo, Nebula, Booker, Pulitzer, National Book Award, etc.) or strong critical consensus.
3. Exceptionally popular: a mass-audience book (roughly 100k+ Goodreads ratings, long-running bestseller, canonical school reading).
4. Beloved by a small audience: based on Goodreads. "Y" if average >= 4.20 with roughly 100 to 30,000 ratings. "~" if average 4.00-4.19 in that range, or a high average on fewer than 100 ratings. Leave blank for mass-audience books (they fail by definition) and for averages below 4.00. Search Goodreads for the average and count and report them.
5. Rationalist / Lighthaven fit: written by a community member, or about rationality, epistemics, forecasting, decision theory, AI and AI risk, effective altruism, progress studies, the history of science and invention, or ideas this community discusses heavily. "~" for tangential relevance.

## Kill
Set kill "Y" if the book is a later volume in a series and the first volume is NOT in the existing inventory (list below). Use "?" if you can't tell which volume it is. Otherwise "". Explain in kill_reason.

## Duplicates
If the same title is already in the inventory, say how many copies appear in already_in_inventory; otherwise "".

Be concise in notes and reasoning. If you can't identify the book, use category "Needs check" and confidence "Low".`;

const TRI = { type: "string", enum: ["Y", "~", ""] };

export const RECORD_TOOL = {
  name: "record_book",
  description: "Record the final categorization and ratings for the submitted book. Call exactly once, after researching.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Canonical title, corrected if the submission had typos" },
      author: { type: "string", description: "Author or editor" },
      year: { type: "string", description: "Year first published, or empty" },
      is_fiction: { type: "boolean" },
      category: { type: "string", enum: CATEGORY_NAMES },
      secondary_category: { type: "string", enum: ["", ...CATEGORY_NAMES] },
      historically_significant: TRI,
      critically_acclaimed: TRI,
      exceptionally_popular: TRI,
      beloved_small_audience: TRI,
      rationalist_fit: TRI,
      goodreads: { type: "string", description: "e.g. '4.27 / 6.1k', or 'not found'" },
      kill: { type: "string", enum: ["Y", "?", ""] },
      kill_reason: { type: "string" },
      already_in_inventory: { type: "string" },
      confidence: { type: "string", enum: ["High", "Medium", "Low"] },
      notes: { type: "string", description: "One short line for the spreadsheet Notes column" },
      reasoning: { type: "string", description: "2-4 sentences justifying the ratings" },
    },
    required: [
      "title", "author", "year", "is_fiction", "category", "secondary_category",
      "historically_significant", "critically_acclaimed", "exceptionally_popular",
      "beloved_small_audience", "rationalist_fit", "goodreads", "kill", "kill_reason",
      "already_in_inventory", "confidence", "notes", "reasoning",
    ],
    additionalProperties: false,
  },
};

// Score: max 3.5. "~" earns half the points of "Y".
//   historically significant 1, critically acclaimed 1,
//   popular OR small-audience 0.5 (the better of the two), rationalist fit 1.
export function score(b) {
  const v = (s, full) => (s === "Y" ? full : s === "~" ? full / 2 : 0);
  return (
    v(b.historically_significant, 1) +
    v(b.critically_acclaimed, 1) +
    Math.max(v(b.exceptionally_popular, 0.5), v(b.beloved_small_audience, 0.5)) +
    v(b.rationalist_fit, 1)
  );
}

// Friends of Lighthaven are always included; otherwise any Y includes,
// any ~ makes it a judgment call, nothing means no.
export function include(b) {
  const fol = b.category === "Friend of Lighthaven" || b.secondary_category === "Friend of Lighthaven";
  if (fol) return { include: "Y", why: "Friend of Lighthaven" };
  const vals = [b.historically_significant, b.critically_acclaimed, b.exceptionally_popular, b.beloved_small_audience, b.rationalist_fit];
  if (vals.includes("Y")) return { include: "Y", why: "Criteria" };
  if (vals.includes("~")) return { include: "?", why: "" };
  return { include: "N", why: "" };
}

export const SHEET_HEADERS = [
  "Submitted", "Title", "Author / Editor", "Year", "Category", "Secondary category",
  "Current Location", "Count", "Include?", "Why included", "Score (max 3.5)", "Kill", "Kill reason",
  "1 Historically significant", "2 Critically acclaimed", "3 Exceptionally popular",
  "4 Beloved by small audience", "5 Rationalist / Lighthaven fit", "Goodreads avg / # ratings",
  "Already in inventory", "Confidence", "Notes", "Reasoning", "Submitter notes",
];

export function toRow(b, submission, when) {
  return [
    when, b.title, b.author, b.year, b.category, b.secondary_category,
    submission.location || "", submission.count || "1", b.include, b.why, b.score, b.kill, b.kill_reason,
    b.historically_significant, b.critically_acclaimed, b.exceptionally_popular,
    b.beloved_small_audience, b.rationalist_fit, b.goodreads,
    b.already_in_inventory, b.confidence, b.notes, b.reasoning, submission.notes || "",
  ];
}
