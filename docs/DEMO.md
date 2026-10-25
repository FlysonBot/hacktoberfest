# Demo script (3 minutes)

Judging: **Best Use of Gemma 4** + **Best Open-Source AI Project**.
One person talks, one person drives the laptop. Rehearse with a timer at least twice.

> **Story:** "zyBooks animates its own examples, not the questions you actually have to solve. We animate any question, typed or screenshotted, and let you play with it."

| # | Segment | Time | Ends at |
|---|---|---|---|
| 1 | Hook | 15s | 0:15 |
| 2 | Demo 1: typed stack question | 45s | 1:00 |
| 3 | Demo 2: screenshot of a linked-list question | 45s | 1:45 |
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

**Type into the input box exactly:**
```
Given an empty stack numStack, what are the stack's contents after these operations? Push(numStack, 45), Push(numStack, 56), Push(numStack, 11), Pop(numStack)
```

**Click:** Submit. (Expected plan = `samples/plan_stack.json`.)

**Click:** Next through the steps, reading one caption out loud:

| Step | Shows |
|---|---|
| 0 | empty stack |
| 1 | push 45 |
| 2 | push 56 |
| 3 | push 11 |
| 4 | pop removes 11, top is 56 |

**Practice question** (on the pop step, "Which value does Pop remove?"): **click 45 on purpose** (the wrong answer).

**Say:**
> "I'll answer like someone who mixes up stacks and queues..."

Wait for the explanation, then:
> "Gemma explains *why* I'm wrong, but the correct answer, 11, came from our JavaScript, not the model."

> **If the API is slow (more than ~5s):** "We cache demo responses as a fallback, since free-tier Gemma gets busy at hackathons." Keep going with the cached version.

---

## 3. Demo 2: screenshot (45s), the multimodal moment

**Say:**
> "Most of the time you don't want to retype the question. So, screenshot."

**Click:** the upload button and choose `docs/demo/dll_question.png`, a screenshot of the zyBooks question:
> numList is a doubly-linked list: 12 ⇄ 30. ListInsertAfter(numList, node 30, node 8); ListInsertAfter(numList, node 12, node 45); ListInsertAfter(numList, node 45, node 76)

**Click:** Submit.

**Point at the "Here's what I read" line**, which should show: doubly linked list, starting `12, 30`, then insert 8 after 30, 45 after 12, 76 after 45.

**Say:**
> "Gemma 4 read the image and pulled out the exact values and operations, and it shows us what it read so the student can check it."

**Click:** Play. Let it run to the final list `12 ⇄ 45 ⇄ 76 ⇄ 30 ⇄ 8`.

> **Backup:** if upload or extraction fails, say "we cache demo responses as a fallback" and load the cached plan (`samples/plan_doubly_linked_list.json`).

---

## 4. Demo 3: sandbox (30s)

**Type into the input box exactly:**
```
Which nodes are visited when searching for 65 in this BST? The root is 21. 21's left child is 12 and right child is 91. 12's children are 11 (left) and 19 (right). 91's children are 65 (left) and 96 (right).
```
(Or have it preloaded, to save time. Expected plan = `samples/plan_bst.json`.)

**Click:** Play. The search path lights up: **21 → 91 → 65**.

**Say:**
> "Now it's not just their example or my question. I can play with it."

**Type into the sandbox box exactly:**
```
insert 70, search 70
```

**Click:** Run. 70 goes 21 → right → 91 → left → 65 → right, then the search follows the same path and finds it.

**Say:**
> "That ran instantly, with no AI in the loop. The sandbox is pure JavaScript, so it's always correct."

---

## 5. How it works (30s)

**Screen:** the architecture diagram from the README (or CLAUDE.md).

**Say:**
> "Gemma 4 does the language part: it reads typed or screenshotted questions, thinks about them, and returns a strict tool call: which data structure, the starting contents, and the exact operations. JavaScript does the correctness part: every step and every answer is computed in code, so the animation is never wrong. And we didn't just trust the model: our eval caught real errors, like the smaller Gemma model reordering the numbers 50, 30, 70 into 50, 30, 40, which builds a different tree. So we validate every response: the right operations, the right number of arguments, and only numbers from the question, in the question's order."

---

## 6. Close (15s)

**Say:**
> "It's fully open source under MIT, including our eval suite. Next: the rest of the CSE 12 book (heaps, sorting, graphs), and running Gemma locally so it works offline in lecture. Thanks!"

**Screen:** the repo URL `github.com/FlysonBot/hacktoberfest`.

---

## If things go wrong

- **API slow or 503:** "We cache demo responses as a fallback, since free-tier Gemma gets busy at hackathons." Then use the cached version.
- **A caption looks off:** "Captions come from the model, but the animation and answers come from code, so the steps are still right."
- **Total failure:** play the recorded demo video.

## Demo checklist

- [ ] Screenshots saved: `docs/demo/dll_question.png` (Demo 2) and the zyBooks stack question (Hook)
- [ ] Cached responses in `samples/` for all 3 demo questions (stack, doubly linked list, BST), **including captions**, and the fallback tested with Wi-Fi off
- [ ] `GEMINI_API_KEY` set in the terminal running the server; server started with `uv run uvicorn backend.main:app`
- [ ] Browser zoomed in (125–150%), other tabs closed, notifications off
- [ ] Demo inputs copied into a notes file, ready to paste
- [ ] Backup demo video recorded and open in a tab
