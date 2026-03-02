import { auth } from "@/auth"

const toolLinks = [
  {
    title: "Speech Lab",
    description: "Text-to-speech, transcription, and pronunciation tools",
    href: "/projects/tools/speech",
    icon: "record_voice_over",
  },
]

export default async function ToolsPage() {
  const session = await auth()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-foreground blur-reveal">
          Tools
        </h1>
        <p className="text-foreground/60 mt-2 blur-reveal-1">
          Internal utilities and experiments, {session?.user?.name?.split(" ")[0]}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolLinks.map((link, i) => (
          <a
            key={link.href}
            href={link.href}
            className={`group block p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-foreground/5 hover:border-foreground/15 hover:bg-white/80 transition-all blur-reveal-${Math.min(i + 2, 5)}`}
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
