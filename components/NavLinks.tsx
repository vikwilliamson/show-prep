"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/check-in", label: "Check-In" },
  { href: "/chat", label: "Doc Chat" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-borderc/40 hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
