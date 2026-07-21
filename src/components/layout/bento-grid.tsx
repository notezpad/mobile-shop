"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Bento Grid — Apple/Vercel 2026 style asymmetric grid */
export function BentoGrid({
  children,
  className,
  cols = 4,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        {
          "grid-cols-1 md:grid-cols-2": cols === 2,
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-3": cols === 3,
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-4": cols === 4,
        },
        className
      )}
    >
      {children}
    </div>
  );
}

/** Bento Cell — spans columns/rows in the bento grid */
export function BentoCell({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "col-span-1",
        {
          "md:col-span-2": colSpan === 2,
          "lg:col-span-3": colSpan === 3,
          "lg:col-span-4": colSpan === 4,
          "row-span-2": rowSpan === 2,
        },
        className
      )}
    >
      {children}
    </div>
  );
}
