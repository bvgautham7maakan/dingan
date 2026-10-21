"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Tab } from "@/lib/nav";
import { isActive } from "./SideNav";

export default function TabBar({ tabs }: { tabs: Tab[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={isActive(pathname, tab.href) ? "page" : undefined}>
          <span className="ic" aria-hidden="true">
            {tab.icon}
          </span>
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
