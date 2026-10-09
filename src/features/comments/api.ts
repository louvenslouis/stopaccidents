import type { AvatarConfig } from '@/features/profile/avatar';
import { supabase } from '@/lib/supabase';
import type { SafetyReportSummary } from '@/features/safety-report/read';

export type Comment = {
  avatar?: AvatarConfig | null;
  id: string; parent_id: string | null; root_id: string | null; alias: string | null;
  reply_to: string | null; body: string | null; created_at: string; edited_at: string | null;
  deleted: boolean; hidden: boolean; mine: boolean; likes: number; liked: boolean;
  flagged: boolean; replies: number; flags: string[];
};
export type CommentPage = { items: Comment[]; has_more: boolean; total: number; can_comment: boolean; is_moderator: boolean };
export type CommentAction = 'create' | 'edit' | 'delete' | 'like' | 'unlike' | 'flag' | 'hide' | 'restore' | 'dismiss_flags';
export async function readComments(report: SafetyReportSummary, root: string | null = null, after: string | null = null, flagged = false): Promise<CommentPage> {
  const { data, error } = await supabase.rpc('read_report_comments', {
    p_kind: report.report_kind, p_report_id: report.id, p_root_id: root, p_after: after, p_flagged: flagged,
  });
  if (error || !data) throw error ?? new Error('Unavailable');
  return data as CommentPage;
}
export async function writeComment(report: SafetyReportSummary, action: CommentAction, id: string, body?: string, parent?: string) {
  const { error } = await supabase.rpc('write_report_comment', {
    p_kind: report.report_kind, p_report_id: report.id, p_action: action,
    p_id: id, p_body: body ?? null, p_parent_id: parent ?? null,
  });
  if (error) throw error;
}
