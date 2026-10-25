# CLAUDE.md — Project guide (read this first)

Shared source of truth for our 4-person team **and** for any AI coding assistant working in this repo.
If you change a contract below, update this file in the same commit and tell the team.

## What we're building

**Pitch:** "zyBooks animates its own examples, not the questions you have to solve. We animate any question — typed or screenshotted — and let you play with it."

Scope is the data structures in our actual CSE 12 zyBooks (see Topics below).

A student enters one of:
- a **concept**: "how does a queue work?", "explain separate chaining" → Gemma invents a small instructive example
- a **specific question** (typed or **screenshot**): "Given numStack is empty: Push 45, Push 56, Push 11, Pop" → Gemma extracts that exact starting state and those exact operations

The app returns:
1. A **step-by-step animation** with Back / Next / Play and a caption on every step
2. **Practice questions** inside the animation ("Which value does Pop remove?"), with an explanation when the student gets one wrong
3. A **sandbox**: after the animation, the student types their own ops ("push 5, pop") and keeps playing (see Sandbox)

Hackathon: DS3 Hacktoberfest Hack Day (UCSD), Oct 25, 2026. Targets: **Best Use of Gemma 4** and **Best Open-Source AI Project** (repo is public, MIT licensed).
**Submissions due 6:30 PM** on OrganizerHQ (the prize page says 8:00; plan for 6:30).

## The one rule

**JavaScript decides every step and every correct answer. Gemma only chooses what to show and explains it.**

- Gemma never computes hash values, list/tree shapes, search paths, pop results, or answers.
- If Gemma's text disagrees with the JS steps, the JS steps win.
- This is our pitch to judges: the model handles language, code handles correctness, so the animation is never wrong.

## Topics

| Tier | `structure` values |
|---|---|
| **Tier 1** (must work for demo) | `singly_linked_list`, `doubly_linked_list`, `stack`, `queue`, `bst`, `hash_linear_probing`, `hash_chaining` |
| **Tier 2** (if time) | `heap` (show array view + tree view side by side), `insertion_sort` |

Anything unsupported → backend returns `{ "structure": null, "message": "..." }` and the UI shows a text-only explanation.

## Architecture

```
Browser (frontend/)                          Python backend (backend/)            Gemini API
─────────────────                            ─────────────────────────            ──────────
1. user text / screenshot ── POST /api/plan ──> Gemma + show_visualization tool ──> gemma-4
                          <── {structure, initial, ops, source} ──
2. viz/<structure>.js run(initial, ops) → steps[]   (pure JS, no network)
3. steps ──────────────────── POST /api/captions ──> Gemma writes 1 caption per step
                          <── {captions[]} ──
4. viz/<structure>.js questions(steps) → [{prompt, choices, answer}]   (JS decides answers)
5. wrong answer ───────────── POST /api/explain ──> Gemma explains using the correct answer JS gave
6. sandbox ops (typed by student) → run(initial, [...ops, ...sandboxOps]) → /api/captions for new steps only
```

- **The API key never goes to the browser.** All Gemma calls go through the backend.
- FastAPI serves `frontend/` as static files, so it's one origin with no CORS setup.

## Contracts (agree in the first 30 min, then build against samples/)

### 1. Tool call: `show_visualization`

Gemma must call this tool; it does not answer in free text. **Every field is fully typed** (no untyped objects).

```json
{
  "name": "show_visualization",
  "description": "Choose which data-structure visualization to show, its starting contents, and the operations to animate.",
  "parameters": {
    "type": "object",
    "properties": {
      "structure": {
        "type": "string",
        "enum": ["singly_linked_list", "doubly_linked_list", "stack", "queue", "bst",
                 "hash_linear_probing", "hash_chaining", "heap", "insertion_sort"]
      },
      "initial": {
        "type": "array", "items": { "type": "string" },
        "description": "Starting contents, as strings ([] if empty). JS parses numbers."
      },
      "ops": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "op":   { "type": "string", "enum": ["append", "prepend", "insert_after", "remove", "search",
                                                 "push", "pop", "peek", "enqueue", "dequeue",
                                                 "insert", "remove_max", "sort"] },
            "args": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["op", "args"]
        }
      },
      "source": { "type": "string", "enum": ["user_question", "generated_example"] }
    },
    "required": ["structure", "initial", "ops", "source"]
  }
}
```

The `op` enum is the union of all ops; the backend checks the op is valid **for that structure**:

| structure | `initial` | valid ops (`args`) |
|---|---|---|
| `singly_linked_list` / `doubly_linked_list` | values head → tail | `append [v]`, `prepend [v]`, `insert_after [existing, new]`, `remove [v]`, `search [v]` |
| `stack` | values bottom → top | `push [v]`, `pop []`, `peek []` |
| `queue` | values front → back | `enqueue [v]`, `dequeue []`, `peek []` |
| `bst` | values in **level order** (inserting in that order rebuilds the tree) | `insert [v]`, `search [v]`, `remove [v]` |
| `hash_linear_probing` / `hash_chaining` | `initial[0]` = table size, rest = keys already in the table; hash = key % size | `insert [k]`, `search [k]`, `remove [k]` |
| `heap` (max-heap) | array order | `insert [v]`, `remove_max []` |
| `insertion_sort` | the array to sort | `sort []` |

Examples from real zyBooks questions:

| question | tool call |
|---|---|
| Doubly linked list 12 ⇄ 30; ListInsertAfter(30, 8), (12, 45), (45, 76) | `structure: "doubly_linked_list", initial: ["12","30"], ops: [{"op":"insert_after","args":["30","8"]}, {"op":"insert_after","args":["12","45"]}, {"op":"insert_after","args":["45","76"]}]` |
| Empty stack; Push 45, Push 56, Push 11, Pop | `structure: "stack", initial: [], ops: [{"op":"push","args":["45"]}, {"op":"push","args":["56"]}, {"op":"push","args":["11"]}, {"op":"pop","args":[]}]` |
| Search for 65 in the BST shown | `structure: "bst", initial: ["21","12","91","11","19","65","96"], ops: [{"op":"search","args":["65"]}]` |

All examples above use `source: "user_question"`.

> **Eval findings:** with the old schema's untyped `input: {"type": "object"}`, Gemma returned `input: {}` on every call. Typed fields (as above) are required. The eval also saw frequent 503 "high demand" / 500 errors from `gemma-4-31b-it`.

### 2. Question-reading rules (for the Gemma `/api/plan` prompt)

- Copy exact values and operations from the question; set `source: "user_question"`.
- `initial` holds only what already exists before the question's operations; the operations the question asks for go in `ops` (e.g. "insert 50, 30, 70 into a BST" → `initial: []`, three `insert` ops).
- Concept-only requests: invent a small instructive example (4–6 items); `source: "generated_example"`.
- BST shown in an image: list values in **level order** in `initial` (inserting in that order rebuilds the same tree).
- Maps: inserting an existing key overwrites it (don't add a new entry).
- Gemma never computes results or answers.

### 3. Step format (output of `viz/<structure>.js` `run(initial, ops)`)

```json
{
  "structure": "doubly_linked_list",
  "initial": ["12", "30"],
  "ops": [{ "op": "insert_after", "args": ["30", "8"] }],
  "steps": [
    {
      "state": { "nodes": [12, 30], "head": 0, "tail": 1 },
      "highlights": [],
      "action": "initial",
      "detail": { "values": [12, 30] },
      "caption": ""
    },
    {
      "state": { "nodes": [12, 30, 8], "head": 0, "tail": 2 },
      "highlights": [1, 2],
      "action": "insert_after",
      "detail": { "after": 30, "value": 8, "index": 2, "new_tail": true },
      "caption": ""
    }
  ]
}
```

- `state`: a full snapshot (not a diff), so Back/Next is just indexing.
- `highlights`: indices / node ids / bucket indices to color.
- `action`: the op name, or `"initial"` for the starting-state step.
- `detail`: the facts Gemma uses to write the caption. Gemma must only restate these.
- `caption`: empty from JS; filled in from `/api/captions`. If captions fail, show a fallback built from `detail`.

### 4. Viz module interface (`frontend/viz/<structure>.js`)

```js
export function run(initial, ops)       // -> steps[] (format above); initial: string[], ops: [{op, args: string[]}]
export function render(container, step) // draws one step (SVG or canvas)
export function questions(steps)        // -> [{ stepIndex, prompt, choices, answer }]  (JS decides answer)
```

- `questions()`: `choices` are **strings** and `answer` is the correct choice's string (e.g. `choices: ["11","45","56"], answer: "11"`). Never return a number as `answer`: `frontend/answerAdapter.js` treats a numeric answer as an index into `choices`. `eval/test_viz.mjs` checks this.
- **Demo dependency (Viz):** the `stack` module's `questions()` must include **"Which value does Pop remove?"** on each pop step, with choices = the values pushed so far and answer = the value JS popped (demo: choices 45 / 56 / 11, answer 11). Used in `docs/DEMO.md`.

### 5. Sandbox

After the animation, the student types their own ops (e.g. `push 5, pop`).
- JS parses the text into `[{op, args}]` (no Gemma) and validates against the ops table; invalid ops show an inline error.
- The player calls the same `run(initial, [...ops, ...sandboxOps])` + `render()` and jumps to the first new step.
- Gemma is used **only** for captions of the new steps (`/api/captions`); fallback captions from `detail` if it fails.

### 6. Backend endpoints (`backend/main.py`)

| endpoint | request | response |
|---|---|---|
| `POST /api/plan` | `{ "text": str, "image_base64"?: str }` | `{ "structure", "initial", "ops", "source" }` or `{ "structure": null, "message" }`; **503** `{ "detail" }` if every Gemma model is down (no cached demo answer) |
| `POST /api/captions` | `{ "structure", "steps": [{action, detail}] }` | `{ "captions": str[] }` (same length as steps) |
| `POST /api/explain` | `{ "structure", "step": {action, detail}, "prompt", "user_answer", "correct_answer" }` | `{ "explanation": str }` |

**Demo dependency (Frontend):** above the animation, show a read-back line built in JS from the `/api/plan` response: `Here's what I read: <structure>, start <initial>, ops <ops>` (e.g. `Here's what I read: doubly linked list, start 12, 30, ops insert 8 after 30, insert 45 after 12, insert 76 after 45`). **Required for screenshot inputs**, so the student can check what Gemma extracted. Used in `docs/DEMO.md`.

Backend rules:
- **System prompt:** the tested `SYSTEM_PROMPT` (and `TOOL_SCHEMA`) live in `eval/eval_plan.py`. Copy them into `backend/prompts.py` rather than writing a new prompt, and keep them in sync.
- Validate the tool call: `structure` in the enum, every op name valid for that structure, `args` non-empty where the ops table requires a value. Drop unexpected fields.
- **Retry once on invalid output, with an error note:** resend the question with a short note listing what was wrong (e.g. "Your previous answer was invalid: wrong arg count: peek['peek']. Fix these problems."), same model order. `plan()` / `retry_note()` in `eval/eval_plan.py` show how.
- Reject empty-string args (eval saw `["", "12"]`) and values that aren't one plain number or word (eval saw `"// empty stack"`); treat as invalid output and retry.
- `source` must be in the enum. Empty `ops` is invalid only for `generated_example` (a typed question may just ask to show a structure).
- **Faithfulness check** for `source: "user_question"` (skipped, with the ops order check, when a screenshot is attached: the numbers are in the image, not the text): count occurrences, not just presence — each number's count across `initial` + ops `args` must be <= its count in the user's question text (compare `collections.Counter`s); otherwise retry. (Eval: the 26b fallback turned "50, 30, 70, 20, 40" into "50, 30, 40, 20, 40"; 40 appears once in the question but twice in the output.)
- **Arg count** per op must match the ops table: `pop`, `peek`, `dequeue`, `remove_max`, `sort` = 0 args; `push`, `enqueue`, `append`, `prepend`, `insert`, `search`, `remove` = 1; `insert_after` = 2. Wrong count = invalid, retry. (Eval: 26b returned `peek` with args `["peek"]` and `dequeue` with `["[],"]`.)
- **Ops order check** for `source: "user_question"`: use only each op's **last** arg (the value pushed / inserted / searched); those numbers, in op order, must appear in the same order in the question text (subsequence). Last arg only, because students write "insert 8 after 30" (text order 8, 30) while the args are `["30", "8"]`; checking every arg rejected that correct plan. Ops only, not `initial`, since `initial` can legitimately be reordered (BST level order). (Eval: 26b turned "Insert 50, 30, 70, 20, 40" into 50, 30, 40, 20, 70, a different BST, and the Counter check passed it.)
- Model order: `gemma-4-31b-it` gets **one** try (it fails ~80% with 503), then `gemma-4-26b-a4b-it` gets two. A 4xx, timeout, or network error moves straight to the next model. Always run the faithfulness check on 26b output.
- Timeouts: 90s per plan call (30s for cached demo questions), 20s for captions/explain.
- **Demo cache (backend):** `backend/demo_cache.py` maps the `docs/DEMO.md` question texts to `samples/plan_*.json`, served when Gemma is down or invalid twice. Keep it in sync with the demo script.
- 503 "high demand" on 31b happened on about half the calls during the hackathon, so the cached demo responses (Demo safety) are **required, not optional**. In the latest eval run 31b failed 5 of 6 calls, so 26b is effectively the main path: **all validation above must run on 26b output**.
- Wrap all JSON parsing in try/except. Models sometimes add text around the JSON.
- `/api/captions` must return exactly `len(steps)` captions, or the frontend uses fallbacks.
- Create the client once at module level (`client = genai.Client()`); never chain `genai.Client().models...` inline (it closes the connection before the request).

### 7. Demo safety

- For the 3–4 demo questions, the frontend falls back to cached responses in `samples/` (plan + captions) if the API fails, so the demo never depends on Gemini being up.
- The **Eval + demo** lead owns those cached files and keeps them in sync with the demo script.
- Cached responses must include **real captions (not empty)** before the demo. The Eval + demo lead fills them in from `/api/captions` once it works.

## Gemma / API setup

- SDK: `google-genai` (Python). Key comes from env var **`GEMINI_API_KEY`**. Never hardcode it or commit `.env`.
- Models on the Gemini API: `gemma-4-31b-it` (stronger: use for `/api/plan`, especially screenshots) and `gemma-4-26b-a4b-it` (faster: captions/explain, and fallback for `/api/plan` on 503/500).
- **No audio**: E2B/E4B are not on the Gemini API. Image input works.
- Thinking: `thinking_level="minimal"` for captions/explain; `"high"` only for `/api/plan` if latency allows.
- Free tier is about 15 requests/min per key. **Everyone uses their own key** while testing.
- **`CERTIFICATE_VERIFY_FAILED`** (Avast HTTPS scanning): `uv add truststore`, and put `import truststore; truststore.inject_into_ssl()` before importing `google.genai`.

## Repo layout

```
backend/
  main.py           FastAPI app + static serving of frontend/
  gemma.py          all Gemini API calls
  prompts.py        system prompts + tool declaration
frontend/
  index.html
  app.js            input box, calls /api/*, wires player
  player.js         Back / Next / Play, step index, practice question UI, sandbox input
  viz/              one module per structure (run / render / questions)
samples/            plan_*.json and steps_*.json for building before integration + cached demo responses
eval/
  eval_plan.py      sends test questions to Gemma, checks structure / source / initial / ops
tests/              offline pytest tests (no API calls): `uv run pytest`
CLAUDE.md
README.md
LICENSE
```

## Running locally (uv)

Dependencies live in `pyproject.toml` (Python >=3.12); there is no `requirements.txt`. Add packages with `uv add <pkg>`, never `pip install`.

```bash
uv sync
export GEMINI_API_KEY=...   # PowerShell: $env:GEMINI_API_KEY="..."
uv run uvicorn backend.main:app --reload
# open http://localhost:8000
```

## Roles

| Role | Owner | Owns |
|---|---|---|
| Frontend | _name_ | `index.html`, `app.js`, `player.js`: input, "Here's what I read" line, step player, practice question UI, sandbox input |
| Visualizations (JS) | _name_ | `frontend/viz/*`: run / render / questions per structure |
| Backend + Gemma | _name_ | `backend/*`: endpoints, prompts, tool call, captions, explain |
| Eval + demo | _name_ | `samples/` (incl. cached demo responses), `eval/`, test questions, demo script, README, submission |

## Git workflow

- Work on your own branch (`git checkout -b <name>`); stay inside your own folders when you can.
- `git pull origin main` before starting and before pushing.
- Merge to `main` through a quick PR or a heads-up in the group chat. Don't force-push `main`.
- Never commit `.venv/`, `.env`, or API keys.

## Timeline (hacking 1:00 to 6:30)

| Time | Goal |
|---|---|
| 1:00–1:30 | Contracts agreed (this file), sample JSON in `samples/` |
| 1:30–3:30 | Everyone builds against samples: Tier 1 structures in JS, `/api/plan` working, player UI |
| 3:30–4:30 | **Integration: one full path working end to end** (text in → animation + captions + 1 practice question) |
| 4:30–5:45 | Screenshot input, more topics, polish, error states |
| 5:45–6:15 | Freeze features. README, demo video, final test |
| by 6:30 | Submitted on OrganizerHQ |

## Guidance for AI assistants in this repo

- Follow the contracts above exactly; don't invent new fields without updating this file.
- Never move algorithm logic or answer-checking into Gemma prompts. It belongs in `frontend/viz/`.
- Keep changes scoped to the file owner's area unless asked.
- Prefer simple, demo-safe code over clever code. Deadline is 6:30.

## Status and requirements pointer

- Goal: animate any DS/algorithm concept or the student's own question; JS computes steps/answers, Gemma only picks and explains.
- Deadline: submit by 6:30 PM (prize page says 8:00; plan for 6:30).
- Tooling is uv. Layout is settled: root-level `backend/`, `frontend/`, `samples/` (no `src/`). Backend is done: `/api/plan`, `/api/captions`, `/api/explain` work against real Gemma, and FastAPI serves `frontend/` at `/`.
- Full requirements: docs/REQUIREMENTS.md
