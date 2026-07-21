"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Topbar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-6",
        className
      )}
    >
      {children}
    </header>
  );
}

export function TopbarSearch({
  placeholder = "بحث...",
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <div className="absolute inset-y-0 right-3 flex items-center text-muted-foreground pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <input
        type="search"
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-card pr-9 pl-3 text-sm shadow-xs transition-all placeholder:text-muted-foreground/70 hover:border-input-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
      />
      <kbd className="absolute inset-y-0 left-3 my-auto hidden h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground sm:flex">
        ⌘K
      </kbd>
    </div>
  );
}
