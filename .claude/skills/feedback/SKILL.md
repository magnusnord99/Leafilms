---
name: feedback
description: List open bug reports and feature wishes submitted in-app, let Magnus pick which to work, then implement, commit, deploy, and resolve the case. Use when Magnus says "sjekk tilbakemeldinger", "/feedback", "se hva som er meldt inn", or wants to work through the feedback inbox.
argument-hint: "[optional: number or description of which case to jump straight to]"
user-invocable: true
---

The user wants to work through submitted feedback (bugs and wishes reported in-app via the `feedback` table). Args, if any: $ARGUMENTS

## 1. List open cases

Run `npm run feedback:list` (or `tsx scripts/feedback-list.ts` directly). It prints every non-resolved case with type, priority, message, page, attachment flag, timestamp, and id.

Show the list to Magnus. If `$ARGUMENTS` already identifies a case unambiguously, you may skip straight to step 2 for that case — otherwise wait for Magnus to say which one(s) to take.

## 2. Assess each selected case

Read the full message (and open the image at
`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/feedback/<image_path>` if one is attached).

Decide: is this a clear, scoped fix or feature, or does it hinge on a real design choice (layout, scope, behavior with more than one reasonable interpretation)? If vague, **stop and ask Magnus** a specific question rather than guessing. Only proceed to implementation once the direction is clear.

## 3. Implement

Follow the conventions in `CLAUDE.md`: Server Components by default, RLS on any new table, migrations numbered under `supabase/migrations/` (check `ls supabase/migrations | tail` for the next number), reuse existing `lib/services/` logic instead of duplicating it.

## 4. Pre-deploy safety check

`deploy.sh` builds with `gcloud run deploy --source .`, which ships **everything on disk**, committed or not. Before touching git or deploying:

- Run `git status --short` and compare against the state from before you started this case.
- If there are modified/untracked files unrelated to this fix (pre-existing work-in-progress), **stop and tell Magnus** — do not commit or deploy over them. Ask whether to stash them, wait, or proceed anyway.
- Stage only the files this fix actually touched (`git add <specific files>` — never `git add -A` or `git add .`).

## 5. Commit and deploy

Commit with a message referencing the feedback case, e.g. `Fix: <short description> (feedback <id-prefix>)`. Then run `./deploy.sh` and confirm it finishes successfully before moving on.

## 6. Resolve the case

Once deployed, run:

```
tsx scripts/feedback-resolve.ts <feedback-id> "<short reply describing what changed, in Norwegian>"
```

This sets `status = 'resolved'` and fills `admin_reply`, which triggers the existing notification to whoever reported it.

## 7. Report back

Tell Magnus, per case: what was changed, that it's deployed, and the reply that was sent to the reporter.
