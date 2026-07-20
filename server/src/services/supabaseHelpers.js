import { HttpError } from "../utils/errors.js";

export function throwIfSupabaseError(error, context) {
  if (error) {
    throw new HttpError(500, `${context}: ${error.message || "Supabase error"}`, {
      code: error.code,
      details: error.details,
      hint: error.hint
    });
  }
}

export async function fetchAllRows(queryFactory, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory().range(from, to);
    throwIfSupabaseError(error, "Unable to read Supabase rows");
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}
