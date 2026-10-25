# CLAUDE.md — Project guide (read this first)

Shared source of truth for our 4-person team **and** for any AI coding assistant working in this repo.
If you change a contract below, update this file in the same commit and tell the team.

## What we're building

**"zyBooks for anything you're stuck on."** zyBooks animates its own examples, but not the questions you actually have to solve. We animate any data-structure/algorithm concept **or your actual question**.

A student enters one of:
- a **concept**: "explain AVL rotations", "how does BFS work?" → Gemma picks a good example
- a **specific question** (typed or **screenshot**): "Insert 45, 25, 35 into a size-10 table with linear probing" → Gemma extracts that exact input

The app returns:
1. A **step-by-step animation** with Back / Next / Play and a caption on every step
2. **Practice questions** inside the animation ("Which node does BFS visit next?"), with an explanation when the student gets one wrong

Hackathon: DS3 Hacktoberfest Hack Day (UCSD), Oct 25, 2026. Targets: **Best Use of Gemma 4** and **Best Open-Source AI Project** (repo is public, MIT licensed).
**Submissions due 6:30 PM** on OrganizerHQ (the prize page says 8:00; plan for 6:30).

## The one rule

**JavaScript decides every step and every correct answer. Gemma only chooses what to show and explains it.**

- Gemma never computes hash values, rotations, visit orders, or answers.
- If Gemma's text disagrees with the JS steps, the JS steps win.
- This is our pitch to judges: the model handles language, code handles correctness, so the animation is never wrong.

## Architecture

```
Browser (frontend/)                          Python backend (backend/)            Gemini API
─────────────────                            ─────────────────────────            ──────────
1. user text / screenshot ── POST /api/plan ──> Gemma + show_visualization tool ──> gemma-4
                          <── {topic, input} ──
2. viz/<topic>.js run(input) → steps[]   (pure JS, no network)
3. steps ──────────────────── POST /api/captions ──> Gemma writes 1 caption per step
                          <── {captions[]} ──
4. viz/<topic>.js questions(steps) → [{prompt, choices, answer}]   (JS decides answers)
5. wrong answer ───────────── POST /api/explain ──> Gemma explains using the correct answer JS gave
```

- **The API key never goes to the browser.** All Gemma calls go through the backend.
- FastAPI serves `frontend/` as static files, so it's one origin with no CORS setup.

## Contracts (agree in the first 30 min, then build against samples/)

### 1. Tool call: `show_visualization`

Gemma must call this tool; it does not answer in free text.

```json
{
  "name": "show_visualization",
  "description": "Choose which algorithm visualization to show and the example input.",
  "parameters": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "enum": ["hash_linear_probing", "hash_chaining", "bst_insert", "avl_insert", "bfs", "dfs"]
      },
      "input": { "type": "object", "description": "Topic-specific input, see table" },
      "source": { "type": "string", "enum": ["user_question", "generated_example"] }
    },
    "required": ["topic", "input", "source"]
  }
}
```

| topic | `input` shape | example |
|---|---|---|
| `hash_linear_probing` | `{ "size": int, "keys": int[] }` (hash = key % size) | `{ "size": 10, "keys": [45, 25, 35] }` |
| `hash_chaining` | `{ "size": int, "keys": int[] }` | `{ "size": 7, "keys": [10, 17, 3] }` |
| `bst_insert` | `{ "values": int[] }` | `{ "values": [50, 30, 70, 20] }` |
| `avl_insert` | `{ "values": int[] }` | `{ "values": [10, 20, 30, 25] }` |
| `bfs` / `dfs` | `{ "nodes": str[], "edges": [str, str][], "start": str, "directed": bool }` | `{ "nodes": ["A","B","C"], "edges": [["A","B"],["A","C"]], "start": "A", "directed": false }` |

Start with **`hash_linear_probing` and `bst_insert`** working end to end. Add others only after the demo path works.
If a request doesn't fit any topic, the backend returns `{ "topic": null, "message": "..." }` and the UI shows a text-only explanation.

### 2. Step format (output of `viz/<topic>.js` `run(input)`)

```json
{
  "topic": "hash_linear_probing",
  "input": { "size": 10, "keys": [45, 25, 35] },
  "steps": [
    {
      "state": { "buckets": [null, null, null, null, null, 45, null, null, null, null] },
      "highlights": [5],
      "action": "insert",
      "detail": { "key": 45, "hash": 5, "probes": [5], "placed": 5 },
      "caption": ""
    }
  ]
}
```

- `state`: a full snapshot (not a diff), so Back/Next is just indexing.
- `highlights`: bucket indices or node ids to color.
- `detail`: the facts Gemma uses to write the caption. Gemma must only restate these.
- `caption`: empty from JS; filled in from `/api/captions`. If captions fail, show a fallback built from `detail`.

### 3. Viz module interface (`frontend/viz/<topic>.js`)

```js
export function run(input)              // -> steps[] (format above)
export function render(container, step) // draws one step (SVG or canvas)
export function questions(steps)        // -> [{ stepIndex, prompt, choices, answer }]  (JS decides answer)
```

### 4. Backend endpoints (`backend/main.py`)

| endpoint | request | response |
|---|---|---|
| `POST /api/plan` | `{ "text": str, "image_base64"?: str }` | `{ "topic", "input", "source" }` or `{ "topic": null, "message" }` |
| `POST /api/captions` | `{ "topic", "steps": [{action, detail}] }` | `{ "captions": str[] }` (same length as steps) |
| `POST /api/explain` | `{ "topic", "step": {action, detail}, "prompt", "user_answer", "correct_answer" }` | `{ "explanation": str }` |

Backend rules:
- Validate the tool call against the enum and input shape before returning; retry once if invalid.
- Wrap all JSON parsing in try/except. Models sometimes add text around the JSON.
- `/api/captions` must return exactly `len(steps)` captions, or the frontend uses fallbacks.

## Gemma / API setup

- SDK: `google-genai` (Python). Key comes from env var **`GEMINI_API_KEY`**. Never hardcode it or commit `.env`.
- Models on the Gemini API: `gemma-4-31b-it` (stronger: use for `/api/plan`, especially screenshots) and `gemma-4-26b-a4b-it` (faster: captions/explain).
- **No audio**: E2B/E4B are not on the Gemini API. Image input works.
- Thinking: `thinking_config=types.ThinkingConfig(thinking_level="high")` for `/api/plan`; `"minimal"` for captions if speed matters.
- Free tier is about 15 requests/min per key. **Everyone uses their own key** while testing.

## Repo layout

```
backend/
  main.py           FastAPI app + static serving of frontend/
  gemma.py          all Gemini API calls
  prompts.py        system prompts + tool declaration
  requirements.txt  google-genai, fastapi, uvicorn
frontend/
  index.html
  app.js            input box, calls /api/*, wires player
  player.js         Back / Next / Play, step index, practice question UI
  viz/              one module per topic (run / render / questions)
samples/            plan_*.json and steps_*.json so everyone can build before integration
CLAUDE.md
README.md
LICENSE
```

## Running locally (Windows / PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
# open http://localhost:8000
```

## Roles

| Role | Owner | Owns |
|---|---|---|
| Frontend | _name_ | `index.html`, `app.js`, `player.js`: input, step player, practice question UI |
| Visualizations (JS) | _name_ | `frontend/viz/*`: run / render / questions per topic |
| Backend + Gemma | _name_ | `backend/*`: endpoints, prompts, tool call, captions, explain |
| Eval + demo | _name_ | `samples/`, test questions, checks Gemma picks the right topic, demo script, README, submission |

## Git workflow

- Work on your own branch (`git checkout -b <name>`); stay inside your own folders when you can.
- `git pull origin main` before starting and before pushing.
- Merge to `main` through a quick PR or a heads-up in the group chat. Don't force-push `main`.
- Never commit `.venv/`, `.env`, or API keys.

## Timeline (hacking 1:00 to 6:30)

| Time | Goal |
|---|---|
| 1:00–1:30 | Contracts agreed (this file), sample JSON in `samples/` |
| 1:30–3:30 | Everyone builds against samples: hash_linear_probing + bst_insert in JS, `/api/plan` working, player UI |
| 3:30–4:30 | **Integration: one full path working end to end** (text in → animation + captions + 1 practice question) |
| 4:30–5:45 | Screenshot input, more topics, polish, error states |
| 5:45–6:15 | Freeze features. README, demo video, final test |
| by 6:30 | Submitted on OrganizerHQ |

## Guidance for AI assistants in this repo

- Follow the contracts above exactly; don't invent new fields without updating this file.
- Never move algorithm logic or answer-checking into Gemma prompts. It belongs in `frontend/viz/`.
- Keep changes scoped to the file owner's area unless asked.
- Prefer simple, demo-safe code over clever code. Deadline is 6:30.
