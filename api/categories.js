import { CATEGORIES } from "../lib/rubric.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300");
  res.status(200).json(CATEGORIES.map(([name, description]) => ({ name, description })));
}
