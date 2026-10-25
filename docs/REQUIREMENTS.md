# Requirements and state of the project

Last updated: 2026-10-25 (hack day). Layout decided: root-level `backend/`, `frontend/`, `samples/`; tooling is uv.

## One-sentence answer

Build a web app that turns any data-structure/algorithm concept **or the student's own question (typed or screenshot)** into a step-by-step animation with practice questions. Gemma (Google's model, via the Gemini API) picks the topic and writes the words. **JavaScript computes every step and every answer.**

## Must-know

1. **Deadline: 6:30 PM** on OrganizerHQ. The prize page says 8:00 PM. See Contradictions. Plan for 6:30.
2. **The one rule:** JS decides steps and correct answers. Gemma never computes anything. If they disagree, JS wins.
3. **API key stays on the backend** (`GEMINI_API_KEY`). Never commit `.env` or keys.
4. **Repo is public and MIT licensed** (needed for "Best Open-Source AI Project").
5. **Demo path first:** `hash_linear_probing` and `bst_insert` end to end before any other topic.
6. **Free tier is about 15 requests/min per key.** Everyone uses their own key.
7. **No audio.** Image input works.

## Workflow

```
Browser (frontend/)                       Backend (backend/)                     Gemini API
-------------------                       ------------------                     ----------
1. text / screenshot --POST /api/plan---> gemma-4-31b-it + show_visualization --> Gemma
                     <-- {topic,input,source} --
2. viz/<topic>.js run(input) -> steps[]        (pure JS, no network)
3. steps ----------POST /api/captions---> gemma-4-26b-a4b-it, 1 caption/step --> Gemma
                     <-- {captions[]} -- (must be len(steps), else JS fallback from `detail`)
4. viz/<topic>.js questions(steps) -> [{stepIndex,prompt,choices,answer}]  (JS answers)
5. wrong answer ----POST /api/explain---> Gemma explains using JS's correct answer
```

## Current state (from the repo, 2026-10-25)

Only 3 commits. Nothing from the planned layout exists yet.

| Planned (CLAUDE.md) | Actually in repo |
|---|---|
| `backend/main.py`, `prompts.py` | **Missing** (`gemma.py` exists; deps are in `pyproject.toml`, no requirements.txt) |
| `frontend/` (index.html, app.js, player.js, viz/) | Folders only, no code |
| `samples/` | Empty |
| README.md | Only `# hacktoberfest` |
| LICENSE | Present (MIT, 2026, FlysonBot) |
| `backend/gemma.py` | Present: retry/fallback Gemma helper (moved from the old smoke test) |
| `pyproject.toml` | uv, Python >=3.12, deps: fastapi, google-genai, uvicorn |

## Contracts

### `show_visualization` tool (Gemma must call it, no free text)

Fields: `topic` (enum below), `input` (object), `source` (`user_question` or `generated_example`).

| topic | `input` | example |
|---|---|---|
| `hash_linear_probing` | `{size:int, keys:int[]}` (hash = key % size) | `{"size":10,"keys":[45,25,35]}` |
| `hash_chaining` | `{size:int, keys:int[]}` | `{"size":7,"keys":[10,17,3]}` |
| `bst_insert` | `{values:int[]}` | `{"values":[50,30,70,20]}` |
| `avl_insert` | `{values:int[]}` | `{"values":[10,20,30,25]}` |
| `bfs` / `dfs` | `{nodes:str[], edges:[str,str][], start:str, directed:bool}` | `{"nodes":["A","B","C"],"edges":[["A","B"],["A","C"]],"start":"A","directed":false}` |

No fit: backend returns `{"topic": null, "message": "..."}`; UI shows text only.

### Step format (`run(input)` output)

```json
{"topic":"hash_linear_probing","input":{"size":10,"keys":[45,25,35]},
 "steps":[{"state":{"buckets":[null,null,null,null,null,45,null,null,null,null]},
           "highlights":[5],"action":"insert",
           "detail":{"key":45,"hash":5,"probes":[5],"placed":5},"caption":""}]}
```

`state` is a full snapshot. `caption` is empty from JS. Gemma only restates `detail`.

### Viz module (`frontend/viz/<topic>.js`)

`run(input)`, `render(container, step)`, `questions(steps)`.

### Endpoints

| endpoint | request | response |
|---|---|---|
| `POST /api/plan` | `{text, image_base64?}` | `{topic,input,source}` or `{topic:null,message}` |
| `POST /api/captions` | `{topic, steps:[{action,detail}]}` | `{captions:str[]}` (exactly `len(steps)`) |
| `POST /api/explain` | `{topic, step:{action,detail}, prompt, user_answer, correct_answer}` | `{explanation}` |

Backend rules: validate tool call against enum and input shape, retry once if invalid; wrap JSON parsing in try/except (models add text around JSON).

### Gemma settings

- SDK `google-genai`, key from `GEMINI_API_KEY`.
- `gemma-4-31b-it` for `/api/plan` (thinking `high`). `gemma-4-26b-a4b-it` for captions/explain (thinking `minimal` if speed matters).

## Requirements checklist

| Item | Status |
|---|---|
| Goal / judged on | Targets: **Best Use of Gemma 4**, **Best Open-Source AI Project** (CLAUDE.md). Judging rubric and judges: **not stated** |
| Deliverables | Public MIT repo, README, demo video (CLAUDE.md timeline 5:45-6:15), submission on OrganizerHQ. Exact submission fields and video format: **not stated** |
| Deadline | 6:30 PM (CLAUDE.md) vs 8:00 PM (prize page, per CLAUDE.md). Time zone **not stated** (likely Pacific, inferred from UCSD) |
| Hard rules | The one rule above. Hackathon's own rules (team size, allowed tools, pre-existing code): **not stated** |
| Inputs provided | Gemini API (free tier, own key). No starter code beyond the smoke test |
| Expected output | Animation with Back/Next/Play + captions; practice questions with explanations |
| Evaluation | Unknown. Our own check: Gemma picks the right topic (Eval role) |
| Submission process | OrganizerHQ. Who submits: **not stated** |
| Constraints | ~15 req/min free tier; no audio |
| Prizes/tracks | The two above. Requirements per prize beyond "uses Gemma 4" / "open source": **not stated** |

## Contradictions and mismatches

| Issue | Sources |
|---|---|
| Deadline 6:30 PM vs 8:00 PM | CLAUDE.md "Submissions due 6:30 PM ... (the prize page says 8:00)" |
| CLAUDE.md "Roles" owners are all `_name_` placeholders | CLAUDE.md |

## Timeline (CLAUDE.md)

| Time | Goal |
|---|---|
| 1:00-1:30 | Contracts agreed, sample JSON in `samples/` |
| 1:30-3:30 | Build against samples |
| 3:30-4:30 | One full path end to end |
| 4:30-5:45 | Screenshots, more topics, polish |
| 5:45-6:15 | Freeze; README, demo video, final test |
| by 6:30 | Submit |

## Next steps

1. Decide the deadline (6:30) and tell the team.
2. Tell the team the layout is settled (root `backend/`, `frontend/`, `samples/`; uv).
3. Write `samples/plan_*.json` and `samples/steps_*.json` so frontend, viz and backend can work in parallel.
4. Build `hash_linear_probing` and `bst_insert` in `frontend/viz/`, plus `/api/plan`.
5. Fill the Roles table.
6. Integrate, then screenshots, then more topics, then README and video.

## Sources read

CLAUDE.md, README.md, pyproject.toml, .python-version, .gitignore, LICENSE (header), `git ls-files`.
