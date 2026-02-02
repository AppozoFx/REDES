"use client";

export default function LocalTime({ dateMs }: { dateMs: number | null }) {
  const d = typeof dateMs === "number" ? new Date(dateMs) : null;
  const text = d ? d.toLocaleString() : "-";
  return <span suppressHydrationWarning>{text}</span>;
}
