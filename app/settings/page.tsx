"use client"

/* ===========================================================================
 * DIM LISTS / SETTINGS PAGE ("/settings") — manage the reference data
 * ===========================================================================
 * The admin screen for the master lists: positions, simulators, slot times,
 * qualifications and assignment category codes. Editing here updates the live
 * store copy used everywhere else.
 *
 * The starting values come from lib/dim/sample.ts and lib/sample-data.ts; this
 * page is the in-app way to change them at runtime.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import { PageHeader, EmptyState } from "@/components/shared"
import { PositionEditorDialog } from "@/components/position-editor-dialog"
import { SimulatorEditorDialog } from "@/components/simulator-editor-dialog"
import { QualificationEditorDialog } from "@/components/qualification-editor-dialog"
import { AssignmentEditorDialog } from "@/components/assignment-editor-dialog"
import { SlotTimeEditorDialog } from "@/components/slot-time-editor-dialog"
import { HolidayEditorDialog } from "@/components/holiday-editor-dialog"
import { TrainingGroupEditorDialog } from "@/components/training-group-editor-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Plus, Lock, MapPin, Layers, Clock, CalendarDays, Award, ClipboardList, GraduationCap, Pencil, Trash2 } from "lucide-react"
import type { Position, Simulator, Qualification, Assignment, SlotTime, PublicHoliday } from "@/lib/types"
import type { TrainingGroup } from "@/lib/training-groups"
import { programBadgeClass } from "@/lib/program"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const store = useStore()
  const allowed = store.currentRole === "Admin"

  const [posAdd, setPosAdd] = useState(false)
  const [posEdit, setPosEdit] = useState<Position | null>(null)
  const [posDelete, setPosDelete] = useState<Position | null>(null)
  const [posProgram, setPosProgram] = useState<string>("RADAR")
  const [simAdd, setSimAdd] = useState(false)
  const [simEdit, setSimEdit] = useState<Simulator | null>(null)
  const [simDelete, setSimDelete] = useState<Simulator | null>(null)
  const [qualAdd, setQualAdd] = useState(false)
  const [qualEdit, setQualEdit] = useState<Qualification | null>(null)
  const [qualDelete, setQualDelete] = useState<Qualification | null>(null)
  const [asnAdd, setAsnAdd] = useState(false)
  const [asnEdit, setAsnEdit] = useState<Assignment | null>(null)
  const [asnDelete, setAsnDelete] = useState<Assignment | null>(null)
  const [asnGroup, setAsnGroup] = useState<string>("All")
  const [slotAdd, setSlotAdd] = useState(false)
  const [slotEdit, setSlotEdit] = useState<SlotTime | null>(null)
  const [slotDelete, setSlotDelete] = useState<SlotTime | null>(null)
  const [holAdd, setHolAdd] = useState(false)
  const [holEdit, setHolEdit] = useState<PublicHoliday | null>(null)
  const [holDelete, setHolDelete] = useState<PublicHoliday | null>(null)
  const [tgAdd, setTgAdd] = useState(false)
  const [tgEdit, setTgEdit] = useState<TrainingGroup | null>(null)
  const [tgDelete, setTgDelete] = useState<TrainingGroup | null>(null)
  const [tgProgram, setTgProgram] = useState<string>("RADAR")

  // Program-bearing DIM lists (positions, simulators, assignments) follow the
  // global program scope; shared lists (slots, holidays, quals) always show all.
  const posPrograms = Array.from(new Set(store.scopedPositions.map((p) => p.program).filter(Boolean)))
  useEffect(() => {
    if (posPrograms.length && !posPrograms.includes(posProgram)) setPosProgram(posPrograms[0])
  }, [posPrograms, posProgram])

  const scopeHint =
    store.activeProgram === "ALL" ? "all programs" : `${programDisplay(store.activeProgram)} only`

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Settings / DIM Lists"
        description="Manage reference data: positions, simulators, slot times, holidays and qualifications"
      />

      {!allowed && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Lock className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-muted-foreground">
              You are viewing in read-only mode. Administrator access is required to edit DIM lists.
            </p>
          </CardContent>
        </Card>
      )}

      {posAdd && <PositionEditorDialog open={posAdd} onOpenChange={setPosAdd} />}
      {posEdit && <PositionEditorDialog open={!!posEdit} onOpenChange={(o) => !o && setPosEdit(null)} position={posEdit} />}
      <ConfirmDialog
        open={!!posDelete}
        onOpenChange={(o) => !o && setPosDelete(null)}
        title={`Delete position ${posDelete?.code}?`}
        description="This removes the position and clears it from staff home positions. This cannot be undone."
        onConfirm={() => {
          if (posDelete) {
            store.deletePosition(posDelete.id)
            toast.success("Position deleted")
            setPosDelete(null)
          }
        }}
      />
      {simAdd && <SimulatorEditorDialog open={simAdd} onOpenChange={setSimAdd} />}
      {simEdit && <SimulatorEditorDialog open={!!simEdit} onOpenChange={(o) => !o && setSimEdit(null)} simulator={simEdit} />}
      <ConfirmDialog
        open={!!simDelete}
        onOpenChange={(o) => !o && setSimDelete(null)}
        title={`Delete simulator ${simDelete?.code}?`}
        description="This removes the simulator from the catalogue. This cannot be undone."
        onConfirm={() => {
          if (simDelete) {
            store.deleteSimulator(simDelete.id)
            toast.success("Simulator deleted")
            setSimDelete(null)
          }
        }}
      />
      {qualAdd && <QualificationEditorDialog open={qualAdd} onOpenChange={setQualAdd} />}
      {qualEdit && <QualificationEditorDialog open={!!qualEdit} onOpenChange={(o) => !o && setQualEdit(null)} qualification={qualEdit} />}
      <ConfirmDialog
        open={!!qualDelete}
        onOpenChange={(o) => !o && setQualDelete(null)}
        title={`Delete qualification ${qualDelete?.code}?`}
        description="This removes the qualification. This cannot be undone."
        onConfirm={() => {
          if (qualDelete) {
            store.deleteQualification(qualDelete.id)
            toast.success("Qualification deleted")
            setQualDelete(null)
          }
        }}
      />
      {asnAdd && <AssignmentEditorDialog open={asnAdd} onOpenChange={setAsnAdd} />}
      {asnEdit && <AssignmentEditorDialog open={!!asnEdit} onOpenChange={(o) => !o && setAsnEdit(null)} assignment={asnEdit} />}
      <ConfirmDialog
        open={!!asnDelete}
        onOpenChange={(o) => !o && setAsnDelete(null)}
        title={`Delete assignment ${asnDelete?.code}?`}
        description="This removes the assignment code. This cannot be undone."
        onConfirm={() => {
          if (asnDelete) {
            store.deleteAssignment(asnDelete.id)
            toast.success("Assignment deleted")
            setAsnDelete(null)
          }
        }}
      />
      {slotAdd && <SlotTimeEditorDialog open={slotAdd} onOpenChange={setSlotAdd} />}
      {slotEdit && <SlotTimeEditorDialog open={!!slotEdit} onOpenChange={(o) => !o && setSlotEdit(null)} slot={slotEdit} />}
      <ConfirmDialog
        open={!!slotDelete}
        onOpenChange={(o) => !o && setSlotDelete(null)}
        title={`Delete slot time ${slotDelete?.label}?`}
        description="This removes the slot time. This cannot be undone."
        onConfirm={() => {
          if (slotDelete) {
            store.deleteSlotTime(slotDelete.id)
            toast.success("Slot time deleted")
            setSlotDelete(null)
          }
        }}
      />
      {holAdd && <HolidayEditorDialog open={holAdd} onOpenChange={setHolAdd} />}
      {holEdit && <HolidayEditorDialog open={!!holEdit} onOpenChange={(o) => !o && setHolEdit(null)} holiday={holEdit} />}
      <ConfirmDialog
        open={!!holDelete}
        onOpenChange={(o) => !o && setHolDelete(null)}
        title={`Delete public holiday ${holDelete?.name}?`}
        description="This removes the public holiday. This cannot be undone."
        onConfirm={() => {
          if (holDelete) {
            store.deletePublicHoliday(holDelete.id)
            toast.success("Public holiday deleted")
            setHolDelete(null)
          }
        }}
      />
      {tgAdd && <TrainingGroupEditorDialog open={tgAdd} onOpenChange={setTgAdd} />}
      {tgEdit && <TrainingGroupEditorDialog open={!!tgEdit} onOpenChange={(o) => !o && setTgEdit(null)} group={tgEdit} />}
      <ConfirmDialog
        open={!!tgDelete}
        onOpenChange={(o) => !o && setTgDelete(null)}
              title={`Delete training pool ${tgDelete?.label}?`}
              description="This removes the position pool from the OJTI training log. Existing log entries are kept but will no longer be attributed to a pool. This cannot be undone."
        onConfirm={() => {
          if (tgDelete) {
                store.deleteTrainingGroup(tgDelete.id)
                toast.success("Training pool deleted")
            setTgDelete(null)
          }
        }}
      />

      <Tabs defaultValue="positions">
        <TabsList className="flex-wrap">
          <TabsTrigger value="positions">
            <Layers className="mr-2 h-4 w-4" /> Positions
          </TabsTrigger>
          <TabsTrigger value="simulators">
            <MapPin className="mr-2 h-4 w-4" /> Simulators
          </TabsTrigger>
          <TabsTrigger value="slots">
            <Clock className="mr-2 h-4 w-4" /> Slot times
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <CalendarDays className="mr-2 h-4 w-4" /> Public holidays
          </TabsTrigger>
          <TabsTrigger value="quals">
            <Award className="mr-2 h-4 w-4" /> Qualifications
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList className="mr-2 h-4 w-4" /> Assignments
          </TabsTrigger>
          <TabsTrigger value="training-groups">
              <GraduationCap className="mr-2 h-4 w-4" /> Training pools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          <DimCard
            title="Positions"
            count={store.scopedPositions.length}
            allowed={allowed}
            onAdd={() => setPosAdd(true)}
            hint={`showing: ${scopeHint}`}
          >
            <Tabs value={posProgram} onValueChange={setPosProgram} className="mb-4">
              <TabsList>
                {posPrograms.map((pr) => (
                  <TabsTrigger key={pr} value={pr}>
                    {programDisplay(pr)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  {posProgram === "TOWER" ? (
                    <>
                      <TableHead>Group</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Sim unit</TableHead>
                      <TableHead>Airport</TableHead>
                    </>
                  ) : (
                    <TableHead>Description</TableHead>
                  )}
                  <TableHead className="text-right">Validity (days)</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.scopedPositions
                  .filter((p) => p.program === posProgram)
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {p.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      {posProgram === "TOWER" ? (
                        <>
                          <TableCell className="text-muted-foreground">{p.group ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{p.simulatorUnit ?? "—"}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{p.airport ?? "—"}</TableCell>
                        </>
                      ) : (
                        <TableCell className="text-muted-foreground">{p.description}</TableCell>
                      )}
                      <TableCell className="text-right font-mono">{p.validityDays}</TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setPosEdit(p)} onDelete={() => setPosDelete(p)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="simulators" className="mt-4">
          <DimCard
            title="Simulators"
            count={store.scopedSimulators.length}
            allowed={allowed}
            onAdd={() => setSimAdd(true)}
            hint={`showing: ${scopeHint}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Generation</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...store.scopedSimulators]
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {s.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.program ? programDisplay(s.program) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.simulatorType ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.location}</TableCell>
                      <TableCell className="text-muted-foreground">{s.coverageArea ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.generation ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={s.active ? "default" : "outline"}>
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setSimEdit(s)} onDelete={() => setSimDelete(s)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="slots" className="mt-4">
          <DimCard title="Slot times" count={store.slotTimes.length} allowed={allowed} onAdd={() => setSlotAdd(true)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...store.slotTimes]
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {s.startTime}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {s.endTime}
                        </Badge>
                      </TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setSlotEdit(s)} onDelete={() => setSlotDelete(s)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="holidays" className="mt-4">
          <DimCard
            title="Public holidays"
            count={store.publicHolidays.length}
            allowed={allowed}
            onAdd={() => setHolAdd(true)}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...store.publicHolidays]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono">{h.date}</TableCell>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setHolEdit(h)} onDelete={() => setHolDelete(h)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="quals" className="mt-4">
          <DimCard title="Qualifications" count={store.qualifications.length} allowed={allowed} onAdd={() => setQualAdd(true)}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Effect</TableHead>
                  <TableHead>Description</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.qualifications.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {q.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{q.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          q.effect === "allow"
                            ? "border-chart-2/40 text-chart-2"
                            : "border-destructive/40 text-destructive"
                        }
                      >
                        {q.effect}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{q.description}</TableCell>
                    {allowed && (
                      <TableCell className="text-right">
                        <RowActions onEdit={() => setQualEdit(q)} onDelete={() => setQualDelete(q)} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <DimCard
            title="Assignments"
            count={store.scopedAssignments.length}
            allowed={allowed}
            onAdd={() => setAsnAdd(true)}
            hint={`showing: ${scopeHint}`}
          >
            <Tabs value={asnGroup} onValueChange={setAsnGroup} className="mb-4">
              <TabsList className="flex-wrap">
                <TabsTrigger value="All">All</TabsTrigger>
                {Array.from(new Set(store.scopedAssignments.map((a) => a.group))).sort().map((g) => (
                  <TabsTrigger key={g} value={g}>
                    {g}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.scopedAssignments
                  .filter((a) => asnGroup === "All" || a.group === asnGroup)
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  .map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {a.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{a.description}</TableCell>
                      <TableCell className="text-muted-foreground">{a.group}</TableCell>
                      <TableCell className="text-muted-foreground">{a.type}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{programDisplay(a.appliesTo)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={a.active ? "default" : "outline"}>
                          {a.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setAsnEdit(a)} onDelete={() => setAsnDelete(a)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>

        <TabsContent value="training-groups" className="mt-4">
          <DimCard
            title="Training pools"
            count={store.trainingGroups.length}
            allowed={allowed}
            onAdd={() => setTgAdd(true)}
            hint="OJTI position pools"
          >
            <Tabs value={tgProgram} onValueChange={setTgProgram} className="mb-4">
              <TabsList>
                <TabsTrigger value="RADAR">{programDisplay("RADAR")}</TabsTrigger>
                <TabsTrigger value="TOWER">{programDisplay("TOWER")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pool</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Positions</TableHead>
                  {allowed && <TableHead className="w-20 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.trainingGroups
                  .filter((g) => g.program === tgProgram)
                  .map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(programBadgeClass(g.program))}>
                          {programDisplay(g.program)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {g.positionIds.map((pid) => (
                            <Badge
                              key={pid}
                              variant="secondary"
                              className="font-mono"
                              title={store.positionById(pid)?.name}
                            >
                              {store.positionById(pid)?.code ?? pid}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      {allowed && (
                        <TableCell className="text-right">
                          <RowActions onEdit={() => setTgEdit(g)} onDelete={() => setTgDelete(g)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DimCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="Edit">
        <Pencil className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={onDelete} aria-label="Delete">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

function DimCard({
  title,
  count,
  allowed,
  onAdd,
  hint,
  children,
}: {
  title: string
  count: number
  allowed: boolean
  onAdd?: () => void
  hint?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {title} <span className="text-muted-foreground">({count})</span>
          {hint && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {hint}
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" disabled={!allowed || !onAdd} onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <EmptyState icon={Layers} title="No records" description="Add your first record to get started." />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
