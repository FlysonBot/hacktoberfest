# Demo script (3 minutes)

Judging: **Best Use of Gemma 4** + **Best Open-Source AI Project**.
One person talks, one person drives the laptop. Rehearse with a timer at least twice.

> **Story:** "zyBooks animates its own examples, not the questions you actually have to solve. We animate any question, typed or screenshotted, and let you play with it."

| # | Segment | Time | Ends at |
|---|---|---|---|
| 1 | Hook | 15s | 0:15 |
| 2 | Demo 1: typed stack question | 45s | 1:00 |
| 3 | Demo 2: linked-list question ("Here's what I read") | 45s | 1:45 |
| 4 | Demo 3: sandbox | 30s | 2:15 |
| 5 | How it works | 30s | 2:45 |
| 6 | Close | 15s | 3:00 |

---

## 1. Hook (15s)

**Screen:** the zyBooks challenge activity (screenshot) for the stack question. Plain text, no picture.

**Say:**
> "This is a real CSE 12 zyBooks challenge question. zyBooks animates its own examples, but when it's *your* question, all you get is text and a box for the answer. So when you're stuck, you're stuck. We fixed that."

**Click:** switch to our app tab.

---

## 2. Demo 1: typed question (45s)

**Click:** the **"Demo 1: Stack push/pop"** chip (it fills in the question below), then **Visualize**. Or type it exactly:
```
Given an empty stack numStack, what are the stack's contents after these operations? Push(numStack, 45), Push(numStack, 56), Push(numStack, 11), Pop(numStack)
```
This is a cached demo question, so it loads instantly (expected plan = `samples/plan_stack.json`); the captions and the explanation still come from Gemma live.

**Click:** Next through the steps, reading one caption out loud:

| Step | Shows |
|---|---|
| 0 | empty stack |
| 1 | push 45 |
| 2 | push 56 |
| 3 | push 11, then the quick-check appears **before** the pop |
| 4 | pop removes 11, top is 56 |

**Quick-check** (predict first: on step 3, *before* the pop happens, "Which value will Pop remove?", choices 11 / 45 / 56): **click 45 on purpose** (the wrong answer).

**Say:**
> "It asks me to predict before it shows me. I'll answer like someone who mixes up stacks and queues..."

Wait for the explanation, then click **Next** to step 4 so the pop removes 11:
> "Gemma explains *why* I'm wrong, but the correct answer, 11, came from our JavaScript, not the model."

> **If the explanation is slow (more than ~5s):** "Free-tier Gemma gets busy at hackathons; the correct answer is already computed in JavaScript." Keep going.

---

## 3. Demo 2: linked-list question (45s)

**Click:** the **"Demo 2: Linked list insert"** chip, then **Visualize**. This is the zyBooks question (cached, loads instantly):
> numList is a doubly-linked list: 12 ⇄ 30. ListInsertAfter(numList, node 30, node 8); ListInsertAfter(numList, node 12, node 45); ListInsertAfter(numList, node 45, node 76)

**Point at the "Here's what I read" line**, which shows: Doubly Linked List · start with 12, 30 · insert_after 30 8, insert_after 12 45, insert_after 45 76.

**Say:**
> "Before animating anything, it shows exactly what it understood, so the student can catch a misread question. And you don't have to retype homework: screenshots work too. Gemma 4 reads the values and operations straight from the image."

**Click:** Next through the steps to the final list `12 ⇄ 45 ⇄ 76 ⇄ 30 ⇄ 8`.

---

## 4. Demo 3: sandbox (30s)

**Click:** the **"Demo 3: BST search"** chip, then **Visualize** (cached; expected plan = `samples/plan_bst.json`). The question is:
```
Which nodes are visited when searching for 65 in this BST? The root is 21. 21's left child is 12 and right child is 91. 12's children are 11 (left) and 19 (right). 91's children are 65 (left) and 96 (right).
```

**Click:** Next through the steps. The search path lights up: **21 → 91 → 65**.

**Say:**
> "Now it's not just their example or my question. I can play with it."

**Type into the sandbox box exactly:**
```
insert 70, search 70
```

**Press Enter** (or click Run). 70 goes 21 → right → 91 → left → 65 → right, then the search follows the same path and finds it.

**Say:**
> "That ran instantly, with no AI in the loop. The sandbox is pure JavaScript, so it's always correct."

---

## 5. How it works (30s)

**Screen:** the architecture diagram from the README (or CLAUDE.md).

**Say:**
> "Gemma 4 does the language part: it reads typed or screenshotted questions and returns a small JSON plan: which data structure, the starting contents, and the exact operations. JavaScript does the correctness part: every step and every answer is computed in code, so the animation is never wrong. And we didn't just trust the model: our eval caught real errors, like the smaller Gemma model reordering the numbers 50, 30, 70 into 50, 30, 40, which builds a different tree, or swapping which node to insert after. So we validate every response: the right operations and arguments, nodes that actually exist, and only numbers from the question, in the question's order. Typed questions come back in about two seconds."

---

## 6. Close (15s)

**Say:**
> "It's fully open source under MIT, including our eval suite. Next: the rest of the CSE 12 book (heaps, sorting, graphs), and running Gemma locally so it works offline in lecture. Thanks!"

**Screen:** the repo URL `github.com/FlysonBot/hacktoberfest`.

---

## If things go wrong

- **API slow or 503:** the three demo chips load cached plans, so the animations still work; only captions and explanations need Gemma (the app falls back to captions built in JavaScript). Say: "Free-tier Gemma gets busy at hackathons, but every step is computed in JavaScript."
- **A caption looks off:** "Captions come from the model, but the animation and answers come from code, so the steps are still right."
- **Total failure:** play the recorded demo video.

## Demo checklist

- [ ] Screenshot of the zyBooks stack question saved for the Hook (`docs/demo/dll_question.png` is for the README)
- [ ] All 3 demo chips load instantly from the cached plans in `frontend/demo/` (stack 5 steps, DLL 4, BST 4); captions and the Demo 1 explanation show up live
- [ ] `GEMINI_API_KEY` set in the terminal running the server; server started with `uv run uvicorn backend.main:app`
- [ ] Browser zoomed in (125–150%), other tabs closed, notifications off
- [ ] Demo inputs copied into a notes file, ready to paste
- [ ] Backup demo video recorded and open in a tab
