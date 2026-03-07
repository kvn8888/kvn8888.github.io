# Cover Letter Workbench: Gemini Rubric Grading

## The gap after S3 storage

Once the workbench could persist drafts and reference resumes, the next missing piece was obvious: there was still no evaluation loop.

The user already had a strong rubric, but it only existed as chat content. The workbench needed a second Gemini action that could answer a much sharper question than block matching:

"Given this job posting and this current draft, how good is the letter actually?"

## Key design decision: store the rubric as code, not as prompt glue

I moved the exact user-provided rubric into `homepage/src/lib/coverLetterRubric.ts` as a raw string constant.

That mattered for two reasons:

1. The route now uses the user's wording verbatim instead of a paraphrase that will drift over time.
2. The rubric is reviewable and durable in the repo instead of being trapped inside a handler string literal.

```ts
export const COVER_LETTER_REVIEW_RUBRIC = String.raw`# Cover Letter Evaluation Rubric
...`
```

## Route contract

The new route is `POST /api/coverletter/grade`.

Input:

- `jobPosting`
- `coverLetter`

Output:

- overall assessment
- highest-impact change
- per-criterion scores and feedback
- weakest paragraph original + rewrite

The route uses Gemini's JSON response mode so the client gets a predictable structure instead of free-form prose.

## Why structured output matters

Without structure, the UI would have been forced to render one big blob of model text. That is fine for debugging, but weak for iteration.

Structured output made it possible to build a review panel that is actually navigable:

- score badge per criterion
- one card for the overall assessment
- one card for the highest-impact fix
- one side-by-side original-vs-rewrite view for the weakest paragraph

This turns the grading step into something the user can act on quickly instead of something they have to manually parse.

## UI behavior

The workbench now has two Gemini actions in the job-posting panel:

- `Match Blocks`
- `Grade Letter`

`Grade Letter` only runs when both the job posting and draft content exist. When it completes, the review panel appears directly in the workbench instead of sending the result to a console, toast, or modal.

## What I intentionally did not do

I did **not** try to parse the uploaded resume PDFs into the prompt yet.

That would have required an additional extraction step, and doing it halfway would have produced a misleading "resume-aware" review that wasn't actually grounded in resume content. The correct move was to ship the rubric reviewer cleanly first, using the new S3 resume storage as future input for a later extraction pass.

## Validation

The full production build passed after the new route, rubric constant, and review panel were added. That was important because this feature crossed all three app layers:

- shared server-side prompt source
- protected API route
- large client-side render branch in the workbench

## Why this feature is useful

The workbench now has a real loop:

1. match reusable blocks to a job post
2. assemble a draft
3. save it to S3 if needed
4. grade the current draft against a durable rubric
5. revise the weakest paragraph, not just the easiest paragraph

That closes a meaningful product gap. The tool no longer just helps write a cover letter. It now helps judge whether the letter is actually worth sending.