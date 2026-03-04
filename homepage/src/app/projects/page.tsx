import { auth } from "@/auth"

const projectLinks = [
  {
    title: "API Usage Monitor",
    description: "Track credits, limits, and burn rate across Tavily, Vercel, and more",
    href: "/projects/usage",
    icon: "monitoring",
  },
  {
    title: "Sign-In Manager",
    description: "Review login attempts, approve or reject access, and manage email whitelists",
    href: "/projects/logins",
    icon: "shield_person",
  },
  {
    title: "Tools",
    description: "Internal tools and utilities",
    href: "/projects/tools",
    icon: "build",
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
]

export default async function ProjectPage() {
  const session = await auth()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-foreground blur-reveal">
          Welcome, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="text-foreground/60 mt-2 blur-reveal-1">
          Your private project hub. Choose a section below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projectLinks.map((link, i) => (
          <a
            key={link.href}
            href={link.href}
            className={`group block p-6 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border hover:border-glass-border-hover hover:bg-glass-hover transition-all blur-reveal-${Math.min(i + 2, 5)}`}
          >
            <span className="material-symbols-outlined text-foreground/40 group-hover:text-foreground/70 transition-colors text-3xl">
              {link.icon}
            </span>
            <h2 className="text-lg font-medium text-foreground mt-3">
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
