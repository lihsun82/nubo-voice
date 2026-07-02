"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./nubo-v12.css";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Briefing", href: "/briefing" },
  { label: "Agents", href: "/agents" },
  { label: "Automations", href: "/automations" },
  { label: "Smart Home", href: "/smart-home" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
];

export default function NuboV12Shell({
  children,
  title = "NUBO V12",
  subtitle = "AI Automation Command Center",
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <main className="nubo-v12-shell">
      <aside className="nubo-sidebar">
        <div className="nubo-brand">
          <div className="nubo-brand-mark">N</div>
          <div>
            <div className="nubo-brand-title">NUBO</div>
            <div className="nubo-brand-subtitle">Automation OS V12</div>
          </div>
        </div>

        <nav className="nubo-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : ""}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="nubo-sidebar-footer">
          <div className="nubo-small-label">System</div>
          <div className="nubo-system-pill">Online · 127.0.0.1</div>
        </div>
      </aside>

      <section className="nubo-main">
        <header className="nubo-topbar">
          <div>
            <div className="nubo-eyebrow">{subtitle}</div>
            <h1>{title}</h1>
          </div>
          <div className="nubo-topbar-status">
            <span className="nubo-dot"></span>
            Ready
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
