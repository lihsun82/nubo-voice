"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "@/components/NuboCompactSection.module.css";

type NuboCompactSectionProps = {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function NuboCompactSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: NuboCompactSectionProps) {
  const storageKey = `nubo_section_${id}_open_v1`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "true" || stored === "false") {
      setOpen(stored === "true");
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`nubo-section-${id}`}
      >
        <span>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        <b aria-hidden="true">{open ? "−" : "+"}</b>
      </button>
      {open ? (
        <div id={`nubo-section-${id}`} className={styles.body}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
