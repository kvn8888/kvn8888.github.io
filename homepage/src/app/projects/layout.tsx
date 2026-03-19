import { auth, signOut } from "@/auth"
import { BackButton, ProfileMenu } from "@/app/components"

export default async function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <>
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-glass border-b border-glass-border">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton />
              <span className="text-foreground font-medium">Projects</span>
            </div>
            <div className="flex items-center gap-3">
              <ProfileMenu
                userName={session?.user?.name}
                userEmail={session?.user?.email}
                userImage={session?.user?.image}
                signOutAction={async () => {
                  "use server"
                  await signOut({ redirectTo: "/" })
                }}
              />
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </div>
    </>
  )
}
