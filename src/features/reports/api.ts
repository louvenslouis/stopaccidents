import { supabase } from "@/lib/supabase";
import type { Analytics, Category, DateRange } from "./model";

export async function readAnalytics(
  range: DateRange,
  category: Category,
  subcategory: string,
  signal: AbortSignal,
  offset = 0,
): Promise<Analytics> {
  const { data, error } = await supabase
    .rpc("read_report_analytics", {
      p_start: range.start,
      p_end: range.end,
      p_category: category,
      p_subcategory: subcategory,
      p_offset: offset,
    })
    .abortSignal(signal);
  if (error || !data)
    throw new Error(
      "Les rapports ne sont pas disponibles pour le moment. Réessayez dans un instant.",
    );
  return data as Analytics;
}
