"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { answerQuery, closeQuery } from "@/lib/site/queries";

export async function answer(form: FormData) {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  const text = z.string().trim().min(1).max(4000).parse(form.get("answer"));
  await answerQuery(me, id, text);
  redirect(`/m/site-queries/${id}?answered=1`);
}

export async function close(form: FormData) {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  await closeQuery(me, id);
  redirect(`/m/site-queries/${id}`);
}
