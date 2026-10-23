"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NavGroup } from "@/lib/nav";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export default function SideNav({ groups }: { groups: NavGroup[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label="Main menu">
      {groups.map((g) => (
        <div className="nav-group" key={g.key}>
          {g.key !== "home" && (
            <div className="nav-group-title">
              <span aria-hidden="true">{g.icon}</span> {t(g.key)}
            </div>
          )}
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="nav-link"
              aria-current={isActive(pathname, i.href) ? "page" : undefined}
            >
              <span>{t(i.key)}</span>
              {i.stage && <span className="stage-tag">{i.stage.startsWith("P") ? `Phase ${i.stage[1]}` : i.stage}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
