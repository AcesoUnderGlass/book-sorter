import { SYSTEM_PROMPT, RECORD_TOOL } from "./rubric.js";

const API = "https://api.anthropic.com/v1/messages";

async function call(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  return data;
}

// Runs Claude with web search until it calls record_book. Returns the tool input.
export async function judgeBook(submission, inventory) {
  const inventoryText = inventory.length
    ? inventory.join("\n")
    : "(inventory unavailable; leave kill and already_in_inventory blank unless obvious)";

  const userText = [
    `Title: ${submission.title}`,
    `Author: ${submission.author || "(not given)"}`,
    submission.notes ? `Submitter notes: ${submission.notes}` : "",
    submission.category ? `The volunteer has assigned primary category "${submission.category}". Use it.` : "",
    submission.secondary ? `The volunteer has assigned secondary category "${submission.secondary}". Use it.` : "",
    "",
    "<existing_inventory>",
    inventoryText,
    "</existing_inventory>",
  ].filter((l) => l !== null).join("\n");

  const messages = [{ role: "user", content: userText }];
  const base = {
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [
      { type: "web_search_20260318", name: "web_search", max_uses: 5, allowed_callers: ["direct"] },
      RECORD_TOOL,
    ],
  };

  let toolChoice = { type: "auto" };
  for (let i = 0; i < 8; i++) {
    const resp = await call({ ...base, messages, tool_choice: toolChoice });
    const rec = resp.content.find((b) => b.type === "tool_use" && b.name === "record_book");
    if (rec) return rec.input;

    // Content must be sent back unchanged (web search results are encrypted).
    messages.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason === "pause_turn") continue;

    // Finished without recording: insist.
    messages.push({ role: "user", content: "Now call record_book with your final answer." });
    toolChoice = { type: "tool", name: "record_book" };
  }
  throw new Error("Claude did not return a result after several attempts.");
}
