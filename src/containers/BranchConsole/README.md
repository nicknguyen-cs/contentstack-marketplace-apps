# Branch Console — full page app

Branch operations the Contentstack web UI does not offer: **compare**, **merge**, **cherry-pick** and **revert**. Scope is schema only, meaning content types and global fields, which is what the Management API merge endpoints cover. Entries are never touched.

## Where it runs

| | |
|---|---|
| UI location | Full page (`cs.cm.stack.full_page`) |
| Route | `/branch-console` |
| Manifest name | Branch Console |

## Tabs

**Merge**
1. Pick a base branch and a compare branch (swap button available).
2. **Compare** diffs them and lists content types and global fields tagged `modified`, `compare only` or `base only`.
3. Either merge everything with a chosen strategy, or tick individual items to cherry-pick. Cherry-pick is implemented as the `ignore` default strategy plus per-item strategies for your selection.
4. Merging starts a job and switches to the Jobs tab, which polls it.

**Jobs** lists the branch merge queue with status.

**Revert.** Contentstack has no revert endpoint, but every merge auto-creates a backup branch of the base. Reverting means merging that backup back into the target with `overwrite_with_compare`, which restores the pre-merge schema. Backup branches are sorted to the top. There is also a **schema snapshot** download of a branch's full content types and global fields as JSON, the manual safety net when merging without a revert branch.

## Configuration

**Management Token** and **Stack API Key** from [App Configuration](../AppConfiguration/README.md). Branches must be enabled on the stack (a plan-gated feature; the app reports a 412 as such).

The app prefers the stack API key and CMA endpoint reported by the App SDK over the typed configuration values, so a wrong region dropdown cannot break branch calls. A diagnostics panel shows the masked values in use.

## How it works

Branch endpoints (`/v3/stacks/branches_compare`, `branches_merge`, `branches_queue`) are called directly with the management token, because the App SDK proxy has no merge scope and returns 403. Compare is paginated at 100 items per page up to 20 pages. Schema snapshot reads also go direct so the `branch` header is honoured.

## Caveats

- **Revert branch creation** is on by default. Unticking "Create revert branch" sends `no_revert`; this was added because backup creation fails on some `am_v2` stacks, a bug Contentstack has confirmed.
- Merges are schema-only. Content is unaffected.
- Error messages map status codes to likely causes: 401/403 token problems, 422 API key or region mismatch, 412 branches disabled, 429 rate limited.

## Files

| File | Purpose |
|------|---------|
| `BranchConsole.tsx` | Tabs and page state |
| `api.ts` | Compare, merge, queue, snapshot, error mapping |
| `hooks/` | useBranches, useBranchCompare, useMergeJobs |
| `components/` | BranchPicker, CompareView, MergeWizard, MergeJobList, RevertPanel |
