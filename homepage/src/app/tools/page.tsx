import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function ToolsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=%2Ftools")
  }

  redirect("/projects/tools/resume")
}
