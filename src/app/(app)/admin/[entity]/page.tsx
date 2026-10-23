import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { ENTITIES, type Field } from "@/lib/admin/master";
import Submit from "@/components/Submit";
import { saveMaster } from "./actions";

function Input({ f, value }: { f: Field; value: string | string[] | boolean | undefined }) {
  const id = `f-${f.name}`;
  if (f.type === "checkbox")
    return (
      <label className="check-chip" htmlFor={id}>
        <input id={id} type="checkbox" name={f.name} defaultChecked={value === undefined ? true : Boolean(value)} /> {f.label}
      </label>
    );
  if (f.type === "users")
    return (
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="label">{f.label}</legend>
        <div className="checks">
          {f.options?.map((o) => (
            <label key={o.value} className="check-chip">
              <input type="checkbox" name={f.name} value={o.value} defaultChecked={Array.isArray(value) && value.includes(o.value)} /> {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  return (
    <div className="field">
      <label htmlFor={id}>
        {f.label}
        {f.required && " *"}
      </label>
      {f.type === "select" ? (
        <select id={id} name={f.name} defaultValue={String(value ?? "")} required={f.required}>
          {!f.required && <option value="">–</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={f.name}
          type={f.type === "aed" || f.type === "number" ? "number" : f.type}
          step={f.type === "aed" ? "0.01" : f.type === "number" ? "any" : undefined}
          defaultValue={String(value ?? "")}
          required={f.required}
        />
      )}
      {f.help && <span className="caption">{f.help}</span>}
    </div>
  );
}

export default async function MasterPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ edit?: string; saved?: string; error?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { entity } = await params;
  const sp = await searchParams;
  const cfg = ENTITIES[entity];
  if (!cfg) notFound();
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const [fields, rows] = await Promise.all([cfg.fields(), cfg.rows()]);
  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  const values = editing ? cfg.toForm(editing) : {};

  return (
    <>
      <h1>{t(cfg.title)}</h1>
      {sp.saved && <p className="notice notice-ok" role="status">✓ {tc("saved")}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{sp.error}</p>}

      <div className="table-wrap" tabIndex={0}>
        <table className="kem">
          <thead>
            <tr>
              {cfg.columns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th>{tc("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cfg.columns.map((c) => (
                  <td key={c.label}>{c.value(r)}</td>
                ))}
                <td>
                  <Link href={`/admin/${entity}?edit=${r.id}#form`}>{tc("edit")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="form">{editing ? tc("edit") : tc("add")}</h2>
      <form action={saveMaster} className="form" key={editing?.id ?? "new"}>
        <input type="hidden" name="_entity" value={entity} />
        {editing && <input type="hidden" name="_id" value={editing.id} />}
        {fields.map((f) => (
          <Input key={f.name} f={f} value={values[f.name]} />
        ))}
        <div className="row">
          <Submit>{tc("save")}</Submit>
          {editing && (
            <Link className="btn" href={`/admin/${entity}`}>
              {tc("cancel")}
            </Link>
          )}
        </div>
      </form>
    </>
  );
}
