import Link from 'next/link'
import { published } from '@/lib/jobWorkflowPublished'
import { workflowChanges } from '@/lib/jobWorkflowChanges'
import { verifiedReleases } from '@/lib/jobWorkflowPublic'
export const dynamic = 'force-dynamic'
export default async function JobsDocumentation() {
 const releases=await verifiedReleases()
 const operations=Object.entries(published.openapi.paths)
 return <main className="mx-auto max-w-5xl px-5 py-14 sm:py-20 text-foreground">
  <header className="blur-reveal mb-10 max-w-3xl space-y-5">
   <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">KevinC.dev / Jobs</Link>
   <p className="font-mono text-xs uppercase tracking-widest text-foreground/50">Workflow reference · API {published.api_version}</p>
   <h1 className="text-4xl sm:text-5xl font-medium tracking-tight">One workflow.<br/>Every client in sync.</h1>
   <p className="text-lg leading-relaxed text-foreground/65">The shared contract for collecting opportunities, capturing answers, handling blockers, and recording confirmed applications.</p>
  </header>
  <section className="blur-reveal-1 rounded-2xl border border-glass-border bg-glass p-6 mb-8">
   <h2 className="text-lg font-medium mb-3">Give agents this starting point</h2>
   <a className="block break-all font-mono text-sm underline underline-offset-4" href={published.base_url+"/api/job-workflow/discovery"}>https://www.kevinc.dev/api/job-workflow/discovery</a>
   <p className="mt-4 text-sm text-foreground/60">Documentation is public. Job records, captured answers, and writes require an authorized key or website session.</p>
   <div className="flex flex-wrap gap-3 mt-5 text-sm">{[['OpenAPI JSON','openapi.json'],['Agent guide','guide'],['Changes','changes'],['Release manifest','releases']].map(([title,name])=><a key={name} href={`/api/job-workflow/${name}`} className="rounded-full border border-glass-border bg-foreground/5 px-4 py-2 hover:bg-foreground/10">{title}</a>)}</div>
  </section>
  <div className="blur-reveal-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
   <article className="min-w-0 space-y-8">{published.guide.split('\n## ').slice(1).map(section=>{const [title,...body]=section.split('\n');return <section key={title} className="space-y-3"><h2 className="text-xl font-medium">{title}</h2>{body.join('\n').trim().split('\n\n').map((paragraph,index)=><p key={index} className="whitespace-pre-line break-words text-sm leading-7 text-foreground/70">{paragraph}</p>)}</section>})}</article>
   <aside className="space-y-5"><section className="rounded-2xl border border-glass-border bg-glass p-5"><h2 className="font-medium mb-3">Verified releases</h2>{releases.length?releases.map(release=><div key={release.version} className="text-sm space-y-2"><p>Tools & extension {release.version}</p>{release.artifacts.map((asset:{kind:string;url:string})=><a key={asset.kind} href={asset.url} className="block underline underline-offset-4">Download {asset.kind}</a>)}<p className="text-xs text-foreground/50">Verify the SHA-256 in the release manifest before installing.</p></div>):<p className="text-sm text-foreground/60">No verified compatible release is currently advertised. API documentation remains available.</p>}</section>
    <section className="rounded-2xl border border-glass-border bg-glass p-5"><h2 className="font-medium mb-3">Latest changes</h2>{workflowChanges.map(change=><div key={change.version} className="text-sm space-y-2"><p className="font-mono text-xs text-foreground/50">{change.date} · {change.version}</p><p>{change.summary}</p><ul className="list-disc pl-4 space-y-2 text-foreground/60">{change.required_actions.map(action=><li key={action}>{action}</li>)}</ul></div>)}</section>
   </aside>
  </div>
  <section className="mt-14 space-y-4"><h2 className="text-2xl font-medium">API reference</h2><p className="text-sm text-foreground/60">Generated from the same definitions used for request validation. Expand an operation for parameters, schema references, and responses.</p>
   {operations.flatMap(([route,methods])=>Object.entries(methods).map(([method,operation])=><details key={method+route} className="rounded-xl border border-glass-border bg-glass p-4"><summary className="cursor-pointer"><span className="font-mono text-xs uppercase text-foreground/50 mr-3">{method}</span><code className="text-sm break-all">{route}</code><p className="mt-1 text-sm text-foreground/60">{operation.summary}</p></summary><pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-foreground/5 p-4 text-xs">{JSON.stringify(operation,null,2)}</pre></details>))}
  </section>
 </main>
}
