import { auth } from "@/auth"

const projectLinks = [
  {
    title: "API Usage Monitor",
    description: "Track credits, limits, and burn rate across Tavily, Vercel, and more",
    href: "/projects/usage",
    icon: "monitoring",
  },
  {
    title: "Project Dashboard",
    description: "Overview of all active projects and their status",
    href: "/projects/dashboard",
    icon: "dashboard",
  },
  {
    title: "Notes",
    description: "Private notes and documentation",
    href: "/projects/notes",
    icon: "edit_note",
  },
  {
    title: "Tools",
    description: "Internal tools and utilities",
    href: "/projects/tools",
    icon: "build",
  },
]

export default async function ProjectPage() {
  const session = await auth()

  return (
    <div className="blur-reveal">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="text-foreground/60 mt-2">
          Your private project hub. Choose a section below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projectLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="group block p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-foreground/5 hover:border-foreground/15 hover:bg-white/80 transition-all"
          >
            <span className="material-symbols-outlined text-foreground/40 group-hover:text-foreground/70 transition-colors text-3xl">
              {link.icon}
            </span>
            <h2 className="text-lg font-semibold text-foreground mt-3">
              {link.title}
            </h2>
            <p className="text-sm text-foreground/50 mt-1">
              {link.description}
            </p>
          </a>
        ))}
      </div>
    </div>
  )
}
