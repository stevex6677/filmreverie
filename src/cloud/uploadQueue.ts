/** Six photograph pipelines at once, with results kept in the original frame order. */
export async function runPhotoUploads<T, R>(
  photos: readonly T[], signal: AbortSignal, upload: (photo: T, index: number) => Promise<R>,
): Promise<R[]> {
  signal.throwIfAborted();
  const results = new Array<R>(photos.length);
  let next = 0, failed = false;
  let failure: unknown;
  async function worker() {
    while (!failed && next < photos.length) {
      try {
        signal.throwIfAborted();
        const index = next++;
        results[index] = await upload(photos[index], index);
      } catch (error) {
        if (!failed) { failed = true; failure = error; }
      }
    }
  }
  // Drain started uploads before allowing a retry; never leave a previous save running.
  await Promise.all(Array.from({ length: Math.min(6, photos.length) }, () => worker()));
  if (failed) throw failure;
  signal.throwIfAborted();
  return results;
}
