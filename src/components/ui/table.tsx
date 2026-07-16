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
 * Layout strategy:
 *   `table-layout: fixed` is now the DEFAULT. This is critical for responsive
 *   tables — without it, `table-layout: auto` distributes extra horizontal
 *   space to ALL columns based on content, which on wide screens causes:
 *     - Short-content columns (numbers, badges, actions) to stretch wide,
 *       leaving huge empty space inside cells (visually "empty space on the
 *       left" in RTL because text-align is start = right).
 *     - Header text to misalign with cell content.
 *   With `table-fixed`, columns honor the explicit `w-XX` widths set on
 *   `<th>` elements, and any remaining width is distributed equally among
 *   the unspecified columns. This produces balanced, predictable layouts on
 *   both small and large screens.
 *
 *   Pass `auto` prop to opt out of fixed layout (rarely needed).
 */

function Table({
  className,
  fixed = true,
  auto = false,
  ...props
}: React.ComponentProps<"table"> & {
  /** Default: true. Use table-layout: fixed for predictable column widths. */
  fixed?: boolean
  /** Opt out of fixed layout and use table-layout: auto. */
  auto?: boolean
}) {
  const useFixed = fixed && !auto
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
          // `table-fixed` (default) — combined with explicit `w-XX` on <th>,
          // this prevents columns from stretching on wide screens. Without
          // it, `table-layout: auto` distributes extra space to ALL columns,
          // making short columns (actions, numbers) look stretched with the
          // header text misaligned from the cell content.
          useFixed && "table-fixed",
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
      className={cn(
        // Muted background + a clear bottom border give the header a
        // distinct "cap" so it reads as its own row instead of blending
        // into the body rows underneath it.
        "bg-muted/40 [&_tr]:border-b [&_tr]:hover:bg-transparent",
        className
      )}
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
        // `text-start` instead of `text-left` — respects inherited direction.
        // Header text is deliberately smaller/lighter (text-xs, muted,
        // semibold + tracking) than the body (text-sm, foreground) — this
        // is the standard "label vs. data" contrast used by dashboards
        // like Stripe/Vercel/Linear, and it's what keeps a wide header row
        // from looking oversized next to compact cell content.
        // `border-e` on every column except the last draws a thin vertical
        // divider between headers, which is what keeps unevenly-sized
        // columns (e.g. a 2-digit number next to a long date) from reading
        // as a misaligned, borderless block of text.
        "text-muted-foreground h-10 px-3 py-2 text-start align-middle text-xs font-semibold tracking-wide whitespace-nowrap border-e border-border/60 last:border-e-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
        // `px-3 py-2.5` matches the header padding so cells align cleanly
        // under their headers. Combined with `table-fixed` and explicit
        // `w-XX` on <th>, this produces balanced, dashboard-grade tables.
        // A faint `border-e` (lighter than the header's) keeps every column
        // visually separated all the way down the table, matching the
        // divider that starts in the header instead of stopping at it.
        "p-2.5 px-3 align-middle text-sm whitespace-nowrap border-e border-border/30 last:border-e-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
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
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
}
