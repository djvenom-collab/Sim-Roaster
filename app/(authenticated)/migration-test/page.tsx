import { notFound } from "next/navigation"
import { MigrationRehearsalPanel } from "@/components/migration-rehearsal-panel"

export default function MigrationTestPage() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "storage/migration-candidate") notFound()
  return <MigrationRehearsalPanel />
}
