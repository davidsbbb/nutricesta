import { requireRole } from "@/lib/auth";
import { NewPostForm } from "../post-form";

export default async function NewPostPage() {
  const { supabase } = await requireRole("trader");
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("banned_terms, banned_patterns, banned_terms_mode, publish_delay_hours")
    .single();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nueva publicación</h1>
      <NewPostForm
        bannedTerms={settings?.banned_terms ?? []}
        bannedPatterns={settings?.banned_patterns ?? []}
        mode={settings?.banned_terms_mode ?? "review"}
        delayHours={settings?.publish_delay_hours ?? 24}
      />
    </div>
  );
}
