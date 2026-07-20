"use client"

/* Per-screen skeleton loaders. Shapes mirror the real layouts so nothing
   jumps when data lands. All pulse via the Skeleton primitive. */
import { Card, Skeleton, cn } from "@/components/ui"

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="px-4 py-3 lg:px-5 lg:py-4">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-16" />
        </Card>
      ))}
    </div>
  )
}

export function ListRowsSkeleton({ rows = 4, avatar = true, className }: {
  rows?: number
  avatar?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
          {avatar && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <div className="flex gap-6 px-4 py-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-40 hidden sm:block" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-4 py-3 border-t border-border">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-44 hidden sm:block" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-5 w-20 rounded-sm ml-auto" />
        </div>
      ))}
    </Card>
  )
}

export function CardsGridSkeleton({ cards = 6, gridClass = "grid sm:grid-cols-2 lg:grid-cols-3 gap-3" }: {
  cards?: number
  gridClass?: string
}) {
  return (
    <div className={gridClass}>
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} className="px-4 py-3">
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-16 rounded-sm" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function TodaySkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1440px] mx-auto">
      <KpiRowSkeleton />
      <div className="grid lg:grid-cols-2 xl:grid-cols-[1.1fr_1.5fr_0.85fr] gap-3 items-start">
        <Card>
          <div className="px-4 pt-3 pb-2"><Skeleton className="h-4 w-32" /></div>
          <ListRowsSkeleton rows={3} />
        </Card>
        <Card>
          <div className="px-4 pt-3 pb-2"><Skeleton className="h-4 w-28" /></div>
          <ListRowsSkeleton rows={5} avatar={false} />
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1">
          <div className="px-4 pt-3 pb-2"><Skeleton className="h-4 w-24" /></div>
          <ListRowsSkeleton rows={5} avatar={false} />
        </Card>
      </div>
      <Card className="px-4 py-3 flex items-center gap-4">
        <Skeleton className="h-4 w-4 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg hidden sm:block" />
      </Card>
    </div>
  )
}

export function ChatListSkeleton() {
  return (
    <div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ThreadSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3 px-3 md:px-4 py-2.5 border-b border-border bg-white">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-5 w-24 rounded-sm ml-auto" />
      </div>
      <div className="flex-1 overflow-hidden bg-secondary/40 px-3 md:px-5 py-4 space-y-3">
        {[
          "self-start w-52", "self-end w-40", "self-start w-64", "self-end w-56", "self-start w-36",
        ].map((c, i) => (
          <div key={i} className={cn("flex", c.includes("self-end") ? "justify-end" : "justify-start")}>
            <Skeleton className={cn("h-12 rounded-lg", c.replace("self-start ", "").replace("self-end ", ""))} />
          </div>
        ))}
      </div>
      <div className="border-t border-border bg-white p-3">
        <Skeleton className="h-9 w-full" />
      </div>
    </>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto grid lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <div className="px-4 pt-3 pb-2"><Skeleton className="h-4 w-24" /></div>
            <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3">
              <div><Skeleton className="h-3 w-16 mb-1.5" /><Skeleton className="h-9 w-full" /></div>
              <div><Skeleton className="h-3 w-16 mb-1.5" /><Skeleton className="h-9 w-full" /></div>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="px-4 pt-3 pb-2 flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
        <ListRowsSkeleton rows={4} avatar={false} />
      </Card>
    </div>
  )
}

export function WizardStepSkeleton() {
  return (
    <div>
      <div className="px-4 pt-3 pb-2 border-b border-border space-y-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-32" />
      </div>
      <ListRowsSkeleton rows={4} avatar={false} />
    </div>
  )
}
