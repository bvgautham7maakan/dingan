import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/current";
import { navFor } from "@/lib/nav";
import { logout } from "@/lib/actions/auth";

// Mobile "More" tab: the full menu as big buttons.
export default async function More() {
  const me = await requireUser();
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  return (
    <>
      <h1>{tn("more")}</h1>
      {navFor(me.roles).map((g) => (
        <section key={g.key}>
          <h2>{tn(g.key)}</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="btn btn-big" style={{ justifyContent: "space-between" }}>
                <span>{tn(i.key)}</span>
                {i.stage && <span className="stage-tag">{i.stage.startsWith("P") ? `Phase ${i.stage[1]}` : i.stage}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <h2>{tn("account")}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <Link href="/account" className="btn btn-big">
          {tn("account")}
        </Link>
        <form action={logout}>
          <button type="submit" className="btn btn-big btn-danger">
            {tc("logout")}
          </button>
        </form>
      </div>
    </>
  );
}
