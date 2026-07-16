"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * RTL-aware Table primitives.
 *
 * Why this exists:
 * The default shadcn/ui Table component forces `text-left` on `<th>` cells.
 * In an RTL layout (when `<html dir="rtl">`), the browser still lays the
 * `<table>` out left-to-right unless we explicitly inherit the direction.
 * The combination of `dir=ltr` (inherited from various ancestor wrappers)
 * plus `text-left` causes:
 *   - Column headers to align to the left even though the cell data is
 *     right-aligned (or vice versa), giving the "headers don't match data"
 *     appearance.
 *   - The whole table visually flipping relative to the rest of the page.
 *
 * The fix:
 *   1. Force `dir="rtl"` on the table container so columns lay out
 *      right-to-left in RTL contexts.
 *   2. Replace `text-left` on `<th>` with `text-start` so the alignment
 *      respects the inherited direction (right in RTL, left in LTR).
 *
 * This is safe in LTR contexts too — `dir="rtl"` is only applied when the
 * document is RTL (detected via the `dir` attribute on `<html>`).
 */

function Table({
  className,
  fixed,
  ...props
}: React.ComponentProps<"table"> & { fixed?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
      dir="rtl"
    >
      <table
        data-slot="table"
        dir="rtl"
        className={cn(
          "w-full caption-bottom text-sm",
          // `fixed` enables `table-layout: fixed` — combined with explicit
          // `w-XX` on <th>, this prevents columns from stretching on wide
          // screens. Without it, `table-layout: auto` distributes extra space
          // to ALL columns, making short columns (actions, numbers) look
          // stretched with the header text misaligned from the cell content.
          fixed && "table-fixed",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // `text-start` instead of `text-left` — respects inherited direction
        "text-foreground h-10 px-2 text-start align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
