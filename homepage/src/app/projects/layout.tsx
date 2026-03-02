import { auth, signOut } from "@/auth"
import { AuroraBackground } from "@/app/components"
import Link from "next/link"
import Image from "next/image"

export default async function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/60 border-b border-foreground/5">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                ← Home
              </Link>
              <span className="text-foreground font-medium">Projects</span>
            </div>
            <div className="flex items-center gap-3">
              {session?.user?.image && (
                <Image
                  src={session.user.image}
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              )}
              <span className="text-sm text-foreground/60">
                {session?.user?.name}
              </span>
              <form
                action={async () => {
                  "use server"
                  await signOut({ redirectTo: "/" })
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </div>
    </>
  )
}
