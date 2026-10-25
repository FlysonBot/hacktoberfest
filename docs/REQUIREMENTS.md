# Requirements and state of the project

Last updated: 2026-10-25 (hack day). Layout decided: root-level `backend/`, `frontend/`, `samples/`; tooling is uv.

## One-sentence answer

Build a web app that turns any data-structure/algorithm concept **or the student's own question (typed or screenshot)** into a step-by-step animation with practice questions. Gemma (Google's model, via the Gemini API) picks the structure and ops and writes the words. **JavaScript computes every step and every answer.**

## Must-know

1. **Deadline: 6:30 PM** on OrganizerHQ. The prize page says 8:00 PM. See Contradictions. Plan for 6:30.
2. **The one rule:** JS decides steps and correct answers. Gemma never computes anything. If they disagree, JS wins.
3. **API key stays on the backend** (`GEMINI_API_KEY`). Never commit `.env` or keys.
4. **Repo is public and MIT licensed** (needed for "Best Open-Source AI Project").
5. **Demo path first:** Tier 1 structures (see CLAUDE.md) before Tier 2.
6. **Free tier is about 15 requests/min per key.** Everyone uses their own key.
7. **No audio.** Image input works.

## Workflow

```
Browser (frontend/)                       Backend (backend/)                     Gemini API
-------------------                       ------------------                     ----------
1. text / screenshot --POST /api/plan---> gemma-4-31b-it + show_visualization --> Gemma
                     <-- {structure,initial,ops,source} --
2. viz/<structure>.js run(initial, ops) -> steps[]        (pure JS, no network)
3. steps ----------POST /api/captions---> gemma-4-26b-a4b-it, 1 caption/step --> Gemma
                     <-- {captions[]} -- (must be len(steps), else JS fallback from `detail`)
4. viz/<structure>.js questions(steps) -> [{stepIndex,prompt,choices,answer}]  (JS answers)
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

The contracts changed in commit `ce4dafc`. CLAUDE.md is the source of truth; they are not duplicated here to avoid drift. Summary:

- `/api/plan` returns `{structure, initial, ops, source}` (or `{structure: null, message}`). Every field is typed; an untyped `input` object made Gemma return `{}`.
- Structures: Tier 1 `singly_linked_list`, `doubly_linked_list`, `stack`, `queue`, `bst`, `hash_linear_probing`, `hash_chaining`. Tier 2 `heap`, `insertion_sort`.
- Viz modules: `run(initial, ops)`, `render(container, step)`, `questions(steps)`.
- `/api/captions` and `/api/explain` take `structure` instead of `topic`.
- Sandbox: student types ops, JS parses them, only captions of new steps go to Gemma.
- Demo safety: cached plan and captions in `samples/` if the API fails.
- Eval: `eval/eval_plan.py` checks Gemma's tool calls.

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
4. Build the Tier 1 structures in `frontend/viz/`, plus `/api/plan`.
5. Fill the Roles table.
6. Integrate, then screenshots, then more topics, then README and video.

## Sources read

CLAUDE.md, README.md, pyproject.toml, .python-version, .gitignore, LICENSE (header), `git ls-files`.
