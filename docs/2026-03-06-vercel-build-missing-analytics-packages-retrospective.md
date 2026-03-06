# When Local Node Modules Lie

This deployment failure looked like a generic Vercel build problem at first because the visible logs stopped at `Running "npm run build"`.

The real failure was simpler and more annoying: the homepage imported two Vercel packages in `homepage/src/app/page.tsx`, but `homepage/package.json` did not declare them.

The missing packages were:

- `@vercel/analytics`
- `@vercel/speed-insights`

That mismatch stayed hidden locally because the packages were already present in `node_modules` from earlier work.
So `next build` passed on the developer machine, while Vercel's clean install failed exactly the way a clean install should.

## What Actually Failed

Vercel's deployment logs showed the build was reaching Turbopack and then stopping on module resolution:

```text
Module not found: Can't resolve '@vercel/analytics/next'
Module not found: Can't resolve '@vercel/speed-insights/next'
```

That is the signature of a package manifest problem, not a framework bug.

## Why the First Checks Were Misleading

Running `npm run build` locally was not enough on its own.
It succeeded because the machine had a non-clean dependency tree.

The useful sequence was:

1. Confirm the deployed commit hash.
2. Reproduce the build locally.
3. Inspect the actual failed Vercel deployment logs, not just the first screenful.
4. Compare imports against declared dependencies.

The logs made the hidden assumption obvious: local success did not mean the manifest was correct.

## The Fix

Declare the packages the app already imports:

```bash
cd homepage
npm install @vercel/analytics @vercel/speed-insights
```

That updated both `package.json` and `package-lock.json` so clean installs and local installs now resolve the same dependency graph.

## Takeaway

When a deployment fails but the local build passes, one of the first things worth checking is whether local `node_modules` is masking a package manifest mistake.

If the code imports a package, the package manifest has to prove it.
Anything else is just hoping the next machine has the same stale dependencies as the last one.