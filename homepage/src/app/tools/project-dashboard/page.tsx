import Link from "next/link"

export default function ProjectDashboardPage() {
  return (
    <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-6 blur-reveal">
      <h1 className="text-2xl font-medium text-foreground">Project Dashboard</h1>
      <p className="text-sm text-foreground/60 mt-2">
        Dashboard widgets are coming soon. Use <Link className="underline underline-offset-2" href="/projects">/projects</Link> for the current project hub.
      </p>
    </div>
  )
}
