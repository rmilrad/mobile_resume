"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Markets", icon: "⚽" },
  { href: "/portfolio", label: "Portfolio", icon: "📊" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={`nav-item ${active ? "active" : ""}`}>
            <span className="nav-icon">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
