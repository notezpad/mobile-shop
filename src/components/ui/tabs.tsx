"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * RTL-aware Tabs primitives.
 *
 * Radix UI's Tabs component internally toggles `dir` on the content panel
 * depending on the orientation and active state. In an RTL document, this
 * sometimes causes the tab content (and the tables nested inside it) to
 * inherit a wrong `dir=ltr`, which breaks RTL layout.
 *
 * Fix: explicitly inherit `dir="rtl"` on TabsContent so any descendant
 * (tables, lists, etc.) renders correctly in RTL contexts.
 */

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-card dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-card text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm data-[state=active]:border-border/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  /**
   * 🛡️ 2026-09-14: `forceMount` is now opt-in via this prop, and we add
   * `data-[state=inactive]:hidden` to the className so that force-mounted
   * content is hidden via CSS (instead of being unmounted by Radix).
   *
   * Why: by default, Radix Tabs unmounts inactive content, which loses
   * local component state (e.g. a stocktake draft you were building).
   * With forceMount, content stays in the DOM but `data-state="inactive"`
   * + `hidden` attribute hide it. This class adds a CSS fallback in case
   * the browser ignores `hidden` (e.g. when a parent flex container
   * forces display).
   *
   * Pass `forceMount` from a parent TabsContent to opt in:
   *   <TabsContent value="stocktake" forceMount>...</TabsContent>
   */
  forceMount,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content> & {
  forceMount?: true
}) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      dir="rtl"
      forceMount={forceMount}
      className={cn(
        "flex-1 outline-none",
        // When forceMount is used, the inactive state must be hidden via CSS
        forceMount && "data-[state=inactive]:hidden",
        className,
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
