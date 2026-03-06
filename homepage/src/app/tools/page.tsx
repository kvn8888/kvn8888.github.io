import { auth } from "@/auth"
import { canAccessPath } from "@/lib/accessGrants"
import { getEmailAccessGrantKeys } from "@/lib/db"
import { redirect } from "next/navigation"

const toolLinks = [
  {
    title: "Sign-In Manager",
    description: "Review login attempts and revoke approvals",
    href: "/tools/sign-in-manager",
    icon: "shield_person",
  },
  {
    title: "Project Dashboard",
    description: "Overview of active projects and status",
    href: "/tools/project-dashboard",
    icon: "dashboard",
  },
  {
    title: "Notes",
    description: "Private notes and documentation",
    href: "/tools/notes",
    icon: "description",
  },
  {
    title: "Runtime Secrets",
    description: "Override API keys without redeploying",
    href: "/tools/secrets",
    icon: "key",
  },
]

export default async function ToolsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=%2Ftools")
  }

  const grantKeys = session.user.email
    ? await getEmailAccessGrantKeys(session.user.email)
    : []
  const visibleToolLinks = toolLinks.filter((link) => canAccessPath(grantKeys, link.href))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-foreground blur-reveal">
          Tools
        </h1>
        <p className="text-foreground/60 mt-2 blur-reveal-1">
          Admin and internal workspace tools, {session.user.name?.split(" ")[0]}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleToolLinks.map((link, i) => (
          <a
            key={link.href}
            href={link.href}
            className={`group block p-6 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border hover:border-glass-border-hover hover:bg-glass-hover transition-all blur-reveal-${Math.min(i + 2, 5)}`}
          >
            <span className="material-symbols-outlined text-foreground/40 group-hover:text-foreground/70 transition-colors text-3xl">
              {link.icon}
            </span>
            <h2 className="text-lg font-medium text-foreground mt-3">{link.title}</h2>
            <p className="text-sm text-foreground/50 mt-1">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
