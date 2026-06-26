"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string };

export default function AlmacenTabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/50 ${
              active
                ? "bg-white text-[#1f3154] shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
                : "text-slate-500 hover:text-[#30518c] dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
