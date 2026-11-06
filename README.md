# Lighthaven Book Intake

A one-page web app for submitting books to the Lighthaven library. For each book it:

1. Reads the existing inventory from the **Books- Before** tab of the library Google Sheet (for duplicate and series checks).
2. Asks Claude, with web search, to identify the book, look up its Goodreads rating, pick a category, and rate it on the five criteria.
3. Computes the score and include/kill decisions in code.
4. Appends a row to the **Submissions** tab (created automatically on first use).

No dependencies, no build step: a static `index.html` plus one Vercel serverless function (`api/submit.js`).

## Rules

All rules live in `lib/rubric.js`:

- **Criteria** (each `Y`, `~` or blank): historically significant (famous author but minor book = `~`), critically acclaimed, exceptionally popular, beloved by a small audience (Goodreads ≥ 4.20 avg on ~100–30k ratings = `Y`; 4.00–4.19 or <100 ratings = `~`), rationalist / Lighthaven fit.
- **Score** (max 3.5): historically significant 1, critically acclaimed 1, popular *or* small-audience 0.5 (the better of the two), rationalist fit 1. A `~` earns half.
- **Include?**: Friends of Lighthaven always `Y`; otherwise `Y` if the score is at least 1.5 (`INCLUDE_THRESHOLD`), else `N`.
- **Kill**: `Y` if it's a later volume in a series whose first volume isn't in the inventory.
- **Categories**: the sheet's Categories tab plus History, History of Industry & WW2, Business Self-Help, Self-Help, and Self-Help: Mind & Philosophy. The volunteer can pick the primary and secondary category in the form; otherwise Claude chooses.

## Deploy on Vercel

1. Import this repo in Vercel (Add New → Project). Framework preset: **Other**. No build command.
2. Add these environment variables (Settings → Environment Variables):

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API Keys |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The service account's email (see below) |
| `GOOGLE_PRIVATE_KEY` | The `private_key` value from the service account's JSON key, including the `-----BEGIN…` lines |
| `SHEET_ID` | Optional. Defaults to the Lighthaven Books sheet |
| `INVENTORY_TAB` | Optional. Defaults to `Books- Before` |
| `SUBMISSIONS_TAB` | Optional. Defaults to `Submissions` |
| `CLAUDE_MODEL` | Optional. Defaults to `claude-sonnet-5-5` |

3. Redeploy after adding the variables.

### Google service account (one-time)

1. In Google Cloud Console, create a project (or use an existing one) and enable the **Google Sheets API**.
2. IAM & Admin → Service Accounts → Create service account. No roles needed.
3. Open it → Keys → Add key → JSON. Copy `client_email` and `private_key` into the Vercel variables above.
4. Share the Lighthaven Books sheet with the service account's email as an **Editor**.

## Cost

Each submission is one Claude request with up to 5 web searches, typically a few cents. The link is open to anyone who has it, so don't post it publicly; the Anthropic console lets you set a monthly spend limit.

## Tests

```
npm test
```

Runs the scoring rules and the full request flow against mocked Claude and Google APIs.
