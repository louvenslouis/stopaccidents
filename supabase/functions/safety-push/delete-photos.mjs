// The database supplies only Storage paths belonging to permanently deleted reports.
export async function deleteReportPhotos(client) {
  const { data: files, error } = await client.rpc("pending_report_photo_deletions");
  if (error) throw error;
  const buckets = new Map();
  for (const file of files) {
    if (!buckets.has(file.bucket_id)) buckets.set(file.bucket_id, []);
    buckets.get(file.bucket_id).push(file.name);
  }
  for (const [bucket, paths] of buckets) {
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
  return { processed: files.length };
}
