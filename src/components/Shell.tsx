import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth/current";
import { navFor, tabsFor } from "@/lib/nav";
import { ROLE_LABEL, isRole } from "@/lib/roles";
import { logout } from "@/lib/actions/auth";
import LangToggle from "./LangToggle";
import OnlineStatus from "./OnlineStatus";
import SideNav from "./SideNav";
import TabBar from "./TabBar";
import OutboxBoot from "./OutboxBoot";

export default async function Shell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const t = await getTranslations("common");
  const roleText = user.roles.filter(isRole).map((r) => ROLE_LABEL[r]).join(" · ");
  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="KEM home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KEM" className="logo" />
        </Link>
        <OnlineStatus />
        <span className="spacer" />
        <div className="who">
          <b>{user.displayName}</b>
          {roleText}
        </div>
        <LangToggle />
      </header>
      <div className="layout">
        <aside className="sidebar">
          <SideNav groups={navFor(user.roles)} />
          <div className="sidebar-foot">
            <Link href="/account" className="nav-link" style={{ padding: "8px 0" }}>
              {user.displayName}
            </Link>
            <form action={logout}>
              <button type="submit" className="btn" style={{ width: "100%" }}>
                {t("logout")}
              </button>
            </form>
          </div>
        </aside>
        <main className="main" id="main">
          {children}
        </main>
      </div>
      <TabBar tabs={tabsFor(user.roles)} />
      <OutboxBoot />
    </>
  );
}
