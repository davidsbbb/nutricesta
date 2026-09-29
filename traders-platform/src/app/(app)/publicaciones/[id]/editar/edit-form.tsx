"use client";

import { useActionState } from "react";
import { buttonCls, FormMessage, inputCls, labelCls } from "@/components/ui";
import { editPost, type PostFormState } from "@/app/(app)/trader/publicaciones/actions";

export function EditPostForm(props: { id: string; title: string; body: string; conflicts: string }) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(
    editPost.bind(null, props.id),
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="title">Título</label>
        <input id="title" name="title" defaultValue={props.title} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="body">Contenido</label>
        <textarea id="body" name="body" defaultValue={props.body} rows={10} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="conflicts">Conflictos de interés</label>
        <textarea id="conflicts" name="conflicts" defaultValue={props.conflicts} rows={2} required className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <button className={buttonCls} disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}
