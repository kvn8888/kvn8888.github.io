# The Proxy Was Fine, The Mount Point Was Wrong

The `/polymarket` outage looked like a TLS or OAuth problem from the browser surface area:

- “connection is not secure”
- “load cannot follow more than 20 redirections”

But the root cause was much simpler.

The Vercel app was proxying `/polymarket` to the Render app's root URL:

```ts
{
  source: "/polymarket",
  destination: "https://polymarket-ev-bot-docker.onrender.com",
}
```

That sounds reasonable until you inspect the upstream app directly.

## What the Upstream App Actually Expected

The Render app was not mounted at upstream `/`.
It was mounted at upstream `/polymarket`.

The evidence was immediate:

- `https://polymarket-ev-bot-docker.onrender.com` returned `302 Location: /polymarket/`
- `https://polymarket-ev-bot-docker.onrender.com/polymarket` returned `200`
- The HTML shell referenced assets like `/polymarket/assets/...`

That meant the proxy was stripping a prefix that the upstream app relied on.

## Why That Created an Infinite Loop

Once Vercel rewrote `https://www.kevinc.dev/polymarket` to the upstream root, the Render app redirected back to `/polymarket/`.

Then Vercel applied its own trailing-slash normalization and redirected `/polymarket/` back to `/polymarket`.

So the chain became:

1. browser requests `/polymarket`
2. Vercel proxies to upstream `/`
3. upstream responds `302 /polymarket/`
4. Vercel responds `308 /polymarket`
5. repeat forever

That is why the browser hit the 20-redirect ceiling.

## The Fix

The right mapping was to preserve the upstream mount point:

```ts
{
  source: "/polymarket",
  destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket",
},
{
  source: "/polymarket/:path*",
  destination: "https://polymarket-ev-bot-docker.onrender.com/polymarket/:path*",
}
```

This is one of those bugs that looks like networking but is really just path semantics.

## Practical Lesson

When a proxied app is mounted under a subpath on the upstream host, the proxy destination usually has to preserve that same subpath.

If the upstream HTML, asset URLs, or root redirects all point at `/some-base-path/...`, stripping that prefix in the reverse proxy is enough to create a redirect loop even when every certificate, domain, and auth setting is otherwise correct.