# AI Integration Ideas

Potential uses for AI in Indkøbsvogn, ranked by impact vs. implementation effort.

---

## High value, low effort

### 1. Smart item suggestions
When typing in the add-item field, suggest items the user *forgot* based on purchase history. Example: "You usually buy coffee filters when you buy coffee." Complements the existing fuzzy match without replacing it.

### 2. Natural language input
Parse free-text or voice input into list items. Examples:
- "Add ingredients for pasta carbonara"
- "Add what I need for lunches this week"

One API call per input, big UX win on mobile where typing is slow.

---

## Medium value, medium effort

### 3. Semantic deduplication
The current Levenshtein fuzzy match misses cross-language or spelling variants like "mælk" vs "milk" vs "sødmælk". An embedding model could cluster these as the same item across the household's vocabulary.

### 4. Trip summary / pattern insights
After completing a trip, surface a brief insight:
- "You skipped 3 recurring items this week"
- "You've bought chicken 4 times this month"

Small LLM call, useful nudge toward better planning.

---

## Lower priority

- **Budget/price intelligence** — requires external pricing data the app doesn't have
- **Route optimization** — already handled client-side via the weighted-position algorithm; LLM overhead isn't justified here

---

## Recommendation

Start with **natural language item input** — it's a single edge function call, fits the existing add-item UX, and directly solves the friction of one-handed mobile typing.
