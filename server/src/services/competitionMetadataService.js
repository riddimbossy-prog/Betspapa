import { fetchLeagueMetadata } from "../providers/apiFootball.js";
import {
  COMPETITION_TYPES,
  competitionPolicy,
  competitionStorageFields,
  resolveCompetitionType
} from "../engine/competitionPolicy.js";
import { throwIfSupabaseError } from "./supabaseHelpers.js";

function key(id, season) {
  return `${Number(id)}:${Number(season)}`;
}

function providerLeagueType(payload) {
  return payload?.response?.[0]?.league?.type || payload?.response?.[0]?.type || null;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function resolveProviderCompetitionTypes(supabase, providerItems = []) {
  const unique = new Map();
  for (const item of providerItems) {
    const league = item?.league || {};
    if (!league.id || !league.season) continue;
    unique.set(key(league.id, league.season), {
      externalLeagueId: Number(league.id),
      season: Number(league.season),
      name: league.name || "Unknown Competition",
      providerType: league.type || null
    });
  }

  const entries = [...unique.values()];
  if (!entries.length) return new Map();

  const externalIds = [...new Set(entries.map((entry) => entry.externalLeagueId))];
  let existing = [];
  try {
    const { data, error } = await supabase
      .from("leagues")
      .select("external_league_id,season,name,competition_type,prediction_enabled,prediction_exclusion_reason")
      .in("external_league_id", externalIds);
    if (error) throw error;
    existing = data || [];
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/competition_type|prediction_enabled|schema cache|does not exist/i.test(message)) {
      const migrationError = new Error(
        "Run supabase/BETSPAPA_V1_23_0_COMPETITION_AND_HALF_MARKET_GUARDS.sql before syncing fixtures."
      );
      migrationError.code = "COMPETITION_POLICY_MIGRATION_REQUIRED";
      throw migrationError;
    }
    throw error;
  }

  const existingMap = new Map(existing.map((row) => [key(row.external_league_id, row.season), row]));
  const output = new Map();
  const unresolved = [];

  for (const entry of entries) {
    const saved = existingMap.get(key(entry.externalLeagueId, entry.season));
    const resolved = resolveCompetitionType({
      providerType: entry.providerType,
      storedType: saved?.competition_type,
      name: entry.name
    });

    if (resolved !== COMPETITION_TYPES.UNKNOWN) {
      output.set(key(entry.externalLeagueId, entry.season), competitionStorageFields({
        providerType: entry.providerType,
        storedType: saved?.competition_type,
        name: entry.name
      }));
    } else {
      unresolved.push(entry);
    }
  }

  const fetched = await mapLimit(unresolved, 4, async (entry) => {
    try {
      const payload = await fetchLeagueMetadata({
        leagueId: entry.externalLeagueId,
        season: entry.season
      });
      return {
        entry,
        providerType: providerLeagueType(payload),
        error: null
      };
    } catch (error) {
      return { entry, providerType: null, error };
    }
  });

  for (const result of fetched) {
    output.set(key(result.entry.externalLeagueId, result.entry.season), competitionStorageFields({
      providerType: result.providerType,
      name: result.entry.name
    }));
  }

  return output;
}

export async function refreshCompetitionMetadata(supabase, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("leagues")
    .select("id,external_league_id,season,name,competition_type,prediction_enabled,prediction_exclusion_reason")
    .or("competition_type.is.null,competition_type.eq.UNKNOWN")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)));
  throwIfSupabaseError(error, "Unable to load competitions awaiting verification");

  const rows = data || [];
  const results = await mapLimit(rows, 4, async (row) => {
    try {
      const payload = await fetchLeagueMetadata({
        leagueId: row.external_league_id,
        season: row.season
      });
      const fields = competitionStorageFields({
        providerType: providerLeagueType(payload),
        name: row.name
      });
      const { error: updateError } = await supabase
        .from("leagues")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      throwIfSupabaseError(updateError, "Unable to save competition type");
      return { id: row.id, name: row.name, ...fields, status: "updated" };
    } catch (refreshError) {
      return {
        id: row.id,
        name: row.name,
        competition_type: COMPETITION_TYPES.UNKNOWN,
        prediction_enabled: false,
        status: "blocked",
        error: refreshError.message || String(refreshError)
      };
    }
  });

  return {
    reviewed: rows.length,
    enabledLeagues: results.filter((row) => competitionPolicy(row).eligible).length,
    blocked: results.filter((row) => !competitionPolicy(row).eligible).length,
    results
  };
}
