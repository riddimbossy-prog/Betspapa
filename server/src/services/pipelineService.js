import { throwIfSupabaseError } from "./supabaseHelpers.js";

export async function savePipelineProgress(supabase, body) {
  const row = {
    run_key: String(body?.runKey || "").trim().slice(0, 180),
    target_date: body?.date,
    mode: String(body?.mode || "today").trim().slice(0, 30),
    stage: String(body?.stage || "unknown").trim().slice(0, 80),
    status: String(body?.status || "running").trim().slice(0, 30),
    completed_stages: Array.isArray(body?.completedStages)
      ? body.completedStages.slice(0, 30)
      : [],
    progress: body?.progress && typeof body.progress === "object"
      ? body.progress
      : {},
    last_error: body?.lastError
      ? String(body.lastError).slice(0, 3000)
      : null,
    updated_at: new Date().toISOString(),
    completed_at:
      body?.status === "complete" || body?.status === "failed"
        ? new Date().toISOString()
        : null
  };

  if (!row.run_key || !row.target_date) {
    throw new Error("Pipeline runKey and date are required");
  }

  const { data, error } = await supabase
    .from("pipeline_runs")
    .upsert(row, { onConflict: "run_key" })
    .select("*")
    .single();

  throwIfSupabaseError(error, "Unable to save pipeline progress");
  return data;
}

export async function getPipelineProgress(supabase, runKey) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("run_key", runKey)
    .maybeSingle();

  throwIfSupabaseError(error, "Unable to load pipeline progress");
  return data;
}

export async function getLatestPipelineStatus(supabase) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(12);

  throwIfSupabaseError(error, "Unable to load pipeline status");
  return data || [];
}
