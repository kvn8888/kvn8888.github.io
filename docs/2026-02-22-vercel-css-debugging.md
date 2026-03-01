# From "CSS Not Loading" to a Three-Layer Vercel Misconfiguration

I had a Next.js site with Tailwind CSS that looked perfect locally. On Vercel, it was completely unstyled. What seemed like a simple CSS import issue turned out to be three separate problems stacked on top of each other, each one masking the next.

## The Starting Point

The project is a personal homepage — a Next.js 15 app living in a `homepage/` subdirectory of a GitHub Pages repo. The repo root still had an old static `index.html` from a previous iteration. Tailwind v4 handled the styling, using the newer CSS-first configuration (`@import "tailwindcss"` instead of a `tailwind.config.js`). Locally, everything rendered fine. On Vercel, nothing did.

## Step 1: The Build That Couldn't Build

The first thing I checked was whether the build was even succeeding. The `package.json` had:

```json
"build": "next build --turbopack"
```

The `--turbopack` flag tells Next.js to use Turbopack — Vercel's Rust-based bundler meant to replace Webpack — for production builds. In Next.js 15, Turbopack was stable for `next dev`, but for `next build` it introduced a dependency on `@vercel/turbopack-next`, an internal Vercel package. Locally, the build failed with `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` because that package only exists inside Vercel's build infrastructure.

Removing `--turbopack` from the build command revealed a second problem: ESLint was rejecting the build because of unescaped apostrophes in the bio text (`I'm` needs to be `I&apos;m` in JSX) and an unused `Image` import. These are the kind of errors that Turbopack silently skipped — the stricter Webpack build caught them.

The fix was straightforward: drop `--turbopack`, escape the apostrophes, remove the unused import. The build passed.

## Step 2: The CVE That Blocked Deployment

With the build succeeding, Vercel deployed it — but appended an error:

```
Error: Vulnerable version of Next.js detected, please update immediately.
Learn More: https://vercel.link/CVE-2025-66478
```

CVE-2025-66478 (nicknamed "React2Shell") is a critical RCE vulnerability in React Server Components, rated CVSS 10.0. Vercel actively blocks deployments of unpatched versions. Next.js 15.5.0 was affected; the patch landed in 15.5.7.

My first instinct was to jump to the latest — Next.js 16.1.6. This was a mistake. Next.js 16 is a major version bump that changes the minimum Node.js version to 20.9.0, defaults to Turbopack for all builds, and changes the JSX compiler setting. The build succeeded locally but produced 404s on Vercel because the runtime environment wasn't compatible.

I rolled back to 15.5.12, which patches all three RSC CVEs (the original plus two follow-ups for DoS and source code disclosure) without any breaking changes. The build passed, the CVE warning disappeared, but the site still returned 404.

## Step 3: The Framework That Wasn't

The 404 persisted. The build logs looked clean. The deployment showed as "Ready." Something else was wrong.

Using the Vercel CLI, I inspected the deployment:

```
Builds
  ╶ .        [0ms]
```

Zero milliseconds. Vercel wasn't building the app at all — it was treating the project as a static site, looking for files in `public/` or `.`, finding nothing, and serving a 404.

The Vercel CLI confirmed it:

```
Framework Settings
  Framework Preset        Other
  Output Directory        `public` if it exists, or `.`
```

The **Framework Preset** was set to "Other" instead of "Next.js." This is a project-level setting in Vercel that determines how the build output is interpreted. With "Other," Vercel runs `npm run build` (which creates `.next/`) but then looks for static files to serve — completely ignoring the Next.js output. With "Next.js," Vercel knows to read `.next/` and set up serverless functions, static assets, and routing.

The CLI doesn't support changing framework settings, so I hit the Vercel API directly:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"framework": "nextjs"}'
```

One API call. Triggered a redeploy. The site came up with full Tailwind CSS, fonts, and the warm beige background.

## The Gotcha: Three Bugs Wearing a Trench Coat

The frustrating part of this session was that each fix revealed the next problem. The `--turbopack` flag masked the ESLint errors. The ESLint errors masked the CVE block. The CVE block masked the framework preset issue. And the framework preset was the only one that actually mattered for the original symptom — CSS not loading.

If I'd started by checking `vercel inspect` on the deployment, I would have seen the `[0ms]` build time and the "Other" framework preset immediately. The entire debugging chain — Turbopack, ESLint, CVE patching — was real work that needed doing, but none of it was the root cause of the CSS problem.

The early red herring was particularly convincing: the browser's network tab showed a 404 for `homepage.css`. That file was referenced by an old `index.html` at the repo root, not by the Next.js app at all. It looked like a CSS path issue when it was actually a "Vercel is serving the wrong thing entirely" issue.

## What's Next

The site is live, but there's cleanup to do. The old `index.html` and the `homepage.css` reference at the repo root should be removed — they're artifacts of a pre-Next.js version that no longer serve a purpose. The GitHub Actions workflow (`static.yml`) deploys to GitHub Pages from `main`, but the active development is on `version-2` deploying to Vercel. Those two deployment targets should be reconciled. And the Material Symbols font loaded via a `<link>` tag in `<head>` could be moved to `next/font` to eliminate the external request and the ESLint warnings about custom fonts.

---

`vercel inspect` before `git diff` — always check the deployment, not just the code.
