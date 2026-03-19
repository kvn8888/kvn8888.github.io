import Link from "next/link"
import { auth } from "@/auth"
import { canAccessPath } from "@/lib/accessGrants"
import { getEmailAccessGrantKeys } from "@/lib/db"

const projectLinks = [
  {
    title: "API Usage Monitor",
    description: "Track credits, limits, and burn rate across Tavily, Vercel, and more",
    href: "/projects/usage",
    icon: "monitoring",
  },
  {
    title: "Speech Studio",
    description: "Text-to-speech, transcription, and pronunciation tools",
    href: "/projects/speech-studio",
    icon: "record_voice_over",
  },
  {
    title: "Cover Letter Workbench",
    description: "Assemble tailored cover letters from reusable building blocks with AI matching",
    href: "/projects/cover-letter-workbench",
    icon: "edit_note",
  },
  {
    title: "Job Tracker",
    description: "Add, browse, and track job applications with Gemini-powered parsing",
    href: "/projects/job-tracker",
    icon: "work",
  },
  {
    title: "Document OCR",
    description: "Extract text and structure from PDFs and images with Mistral Document AI",
    href: "/projects/ocr",
    icon: "document_scanner",
  },
  {
    title: "Vision",
    description: "Upload an image and ask anything — OCR, object detection, and more via Interfaze",
    href: "/projects/vision",
    icon: "image_search",
  },
  {
    title: "Tools",
    description: "Sign-in manager, notes, and project dashboard",
    href: "/tools",
    icon: "build",
  },
]

function getProjectRevealClass(href: string, index: number) {
  if (href === "/tools") {
    return 'blur-reveal-8'
  }

  return `blur-reveal-${Math.min(index + 2, 7)}`
}

export default async function ProjectPage() {
  const session = await auth()
  const grantKeys = session?.user?.email
    ? await getEmailAccessGrantKeys(session.user.email)
    : []
  const visibleProjectLinks = projectLinks.filter((link) => canAccessPath(grantKeys, link.href))

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
        {visibleProjectLinks.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            className={`group block p-6 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border hover:border-glass-border-hover hover:bg-glass-hover transition-all ${getProjectRevealClass(link.href, i)}`}
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
          </Link>
        ))}
      </div>
    </div>
  )
}
