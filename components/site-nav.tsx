"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Performance" },
  { href: "/composition", label: "Composition" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex h-12 items-center gap-1 px-4 md:px-6">
        <Link href="/" className="mr-4 font-semibold tracking-tight">
          EBI Tracker
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              pathname === l.href ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
