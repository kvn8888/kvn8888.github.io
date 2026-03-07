# Cover Letter Workbench: S3 Drafts and Reference Resumes

## Why this change existed

The workbench already had two useful pieces:

1. A Jobs Turso-backed library of reusable cover-letter blocks.
2. A local editor that let me assemble a letter visually.

What it did **not** have was persistence for the assembled draft itself or a durable place to keep the resume PDFs that should eventually feed the grading/generation flow. That meant the reusable sentences were durable, but the final artifact was still fragile and local.

The fix was to add a second storage layer alongside Turso:

- Jobs Turso stays responsible for the structured sentence/tag library.
- S3 now stores two artifact types:
  - reference resumes as PDFs
  - saved cover-letter drafts as JSON documents

## Design choice: reuse the existing S3 bucket, separate by prefix

I deliberately did **not** add another bucket secret just to ship the feature. The repo already had working AWS credentials and a configured `RESUME_S3_BUCKET` for the public homepage resume. Reusing that bucket with clear prefixes was the fastest path that still kept the data model clean.

```ts
const REFERENCE_RESUME_PREFIX = 'coverletter/reference-resumes'
const SAVED_LETTER_PREFIX = 'coverletter/letters'
```

That kept configuration flat while still preventing the new private workbench assets from colliding with the public homepage resume object.

## The storage model

I added `homepage/src/lib/coverLetterStorage.ts` as the single S3 helper module.

It does four important things:

1. Centralizes AWS credential lookup through `getSecret()`.
2. Validates inputs and returns consistent `CoverLetterStorageError` objects with HTTP-friendly status codes.
3. Stores reference resumes as PDF objects with original filename metadata.
4. Stores saved letters as JSON documents that keep both `html` and `plainText`.

Keeping both representations matters. The editor needs HTML to restore the highlighted workbench state, but Gemini review later will want the plain-text draft.

```ts
const document: StoredCoverLetterDocument = {
  id,
  title,
  html,
  plainText,
  jobPosting,
  createdAt: existing?.createdAt ?? timestamp,
  updatedAt: timestamp,
}
```

## API shape

The route layer mirrors the storage model directly:

- `/api/coverletter/reference-resumes`
- `/api/coverletter/reference-resumes/[id]`
- `/api/coverletter/letters`
- `/api/coverletter/letters/[id]`

This gives the client a simple contract:

- list resumes
- upload a PDF
- open or delete a PDF
- list drafts
- create or update a draft
- load or delete a draft

No AWS code leaks into the client component.

## The editor change that made draft CRUD real

The workbench editor originally exposed only `insertBlock()`. That was enough for composition, but not enough for persistence.

The crucial UI-side change was to promote the editor into a controllable surface:

```ts
export interface HighlightEditorHandle {
  insertBlock: (block: Block) => void
  getHtml: () => string
  getPlainText: () => string
  loadHtml: (html: string) => void
  clear: () => void
}
```

That let the page save the current draft to S3 and later rehydrate it into the exact highlighted editor state.

## UI result

The workbench now has an `S3 Drafts & Resumes` card that:

- uploads reference resume PDFs
- lists and opens stored resumes
- saves the current draft to S3
- loads saved drafts back into the editor
- deletes drafts and resumes in place

This was the right cut for the feature because it delivered user-visible CRUD immediately while also laying the foundation for the next request: Gemini grading against a durable rubric plus durable resume context.

## What went wrong

The only build break in this pass was subtle and purely server-side: the resume download route returned a raw `Uint8Array`, which `NextResponse` did not accept as a valid body type in this build. Converting that payload to a `Buffer` fixed it cleanly.

## What this unlocked next

With this change shipped, the grading step is straightforward instead of speculative:

- the rubric can be wired into a dedicated Gemini review route
- the current draft already has a stable saved representation
- reference resumes already live in S3 and can be pulled into future review context

That is the real value of the change: not just “files in a bucket,” but a stable artifact model the rest of the cover-letter workflow can finally build on.