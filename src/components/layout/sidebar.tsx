"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sidebarItemVariants = cva(
  "group/item relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-[var(--duration-base)] ease-[var(--ease-out)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground hover:text-foreground hover:bg-muted",
        active:
          "bg-primary-subtle text-primary-subtle-foreground font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  badgeVariant?: "default" | "success" | "warning" | "danger";
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function Sidebar({
  sections,
  brand,
  footer,
  className,
}: {
  sections: NavSection[];
  brand?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-[260px] flex-col bg-sidebar border-l border-sidebar-border",
        className
      )}
    >
      {/* Brand */}
      {brand && (
        <div className="flex h-16 items-center px-5 border-b border-sidebar-border">
          {brand}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section, i) => (
          <div key={i} className="space-y-1">
            {section.title && (
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    sidebarItemVariants({ variant: active ? "active" : "default" })
                  )}
                >
                  {active && (
                    <span className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l-full bg-primary" />
                  )}
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && <span className="ml-auto">{item.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="border-t border-sidebar-border p-3">
          {footer}
        </div>
      )}
    </aside>
  );
}
