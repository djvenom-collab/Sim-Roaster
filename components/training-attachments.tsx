"use client"

/* ===========================================================================
 * TRAINING ATTACHMENTS — upload & list files on a training session
 * ===========================================================================
 * Two components:
 *   - TrainingAttachmentsEditor: the uploader used inside the training editor
 *     (drag files in; they're sent to /api/training-attachments and stored).
 *   - TrainingAttachmentsList: the read-only "Materials" list shown to enrolled
 *     trainees, with view/download links.
 * Files live in Vercel Blob storage (handled by the API routes).
 * =========================================================================== */
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Paperclip, Upload, X, FileText, FileSpreadsheet, FileImage, File, Download, Loader2 } from "lucide-react"
import type { TrainingAttachment } from "@/lib/types"

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return FileImage
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return FileSpreadsheet
  if (contentType.includes("pdf") || contentType.includes("word") || contentType.includes("document")) return FileText
  return File
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileHref(a: TrainingAttachment, download = false) {
  return `/api/training-attachments/file?pathname=${encodeURIComponent(a.pathname)}${download ? "&download=1" : ""}`
}

/** Editable list used inside the training editor dialog. */
export function TrainingAttachmentsEditor({
  attachments,
  onChange,
}: {
  attachments: TrainingAttachment[]
  onChange: (next: TrainingAttachment[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const uploaded: TrainingAttachment[] = []
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch("/api/training-attachments/upload", { method: "POST", body: form })
        if (!res.ok) {
          toast.error(`Failed to upload ${file.name}`)
          continue
        }
        const data = await res.json()
        uploaded.push({
          id: `att-${Date.now()}-${uploaded.length}`,
          name: data.name,
          pathname: data.pathname,
          url: data.url,
          contentType: data.contentType,
          size: data.size,
          uploadedAt: new Date().toISOString(),
        })
      }
      if (uploaded.length) {
        onChange([...attachments, ...uploaded])
        toast.success(`${uploaded.length} file(s) attached`)
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const removeAttachment = async (a: TrainingAttachment) => {
    onChange(attachments.filter((x) => x.id !== a.id))
    // Best-effort delete from blob storage; UI removal is immediate.
    try {
      await fetch("/api/training-attachments/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: a.url }),
      })
    } catch {
      // ignore — the reference is already removed from the session
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {uploading ? "Uploading…" : "Attach documents"}
      </Button>
      <p className="text-xs text-muted-foreground">
        PowerPoint, PDF, Word, Excel, or images. Trainees enrolled in this session can view them.
      </p>
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((a) => {
            const Icon = fileIcon(a.contentType)
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={a.name}>
                  {a.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(a)}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Read-only list shown on a session card for enrolled trainees. */
export function TrainingAttachmentsList({ attachments }: { attachments: TrainingAttachment[] }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="space-y-1.5 border-t pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Paperclip className="size-3" /> Materials ({attachments.length})
      </p>
      <ul className="space-y-1.5">
        {attachments.map((a) => {
          const Icon = fileIcon(a.contentType)
          return (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={fileHref(a)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                title={a.name}
              >
                {a.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.size)}</span>
              <a
                href={fileHref(a, true)}
                download={a.name}
                aria-label={`Download ${a.name}`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="size-3.5" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
