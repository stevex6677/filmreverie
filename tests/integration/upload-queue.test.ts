import { expect, it, vi } from 'vitest';
import { runPhotoUploads } from '../../src/cloud/uploadQueue';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const signal = () => new AbortController().signal;

it('runs six uploads, refills available slots, and preserves frame order', async () => {
  const jobs = Array.from({ length: 9 }, () => deferred<number>());
  let active = 0, peak = 0;
  const upload = vi.fn(async (_job: unknown, index: number) => {
    peak = Math.max(peak, ++active);
    try { return await jobs[index].promise; } finally { active--; }
  });
  const result = runPhotoUploads(jobs, signal(), upload);
  expect(upload).toHaveBeenCalledTimes(6);
  for (const index of [5, 3, 1]) {
    jobs[index].resolve(index);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(index === 5 ? 7 : index === 3 ? 8 : 9));
  }
  for (const index of [8, 7, 6, 4, 2, 0]) jobs[index].resolve(index);
  expect(await result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(peak).toBe(6);
  expect(active).toBe(0);
});

it('stops queuing after an error and drains started uploads before rejecting', async () => {
  const jobs = Array.from({ length: 8 }, () => deferred<number>());
  const upload = vi.fn((job: typeof jobs[number]) => job.promise);
  const finished = vi.fn();
  const result = runPhotoUploads(jobs, signal(), upload).finally(finished);
  const rejected = expect(result).rejects.toThrow('Upload failed');
  jobs[1].reject(new Error('Upload failed'));
  // Let the failed worker stop the queue before releasing other workers.
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  jobs[2].reject(new Error('Another failure'));
  for (const index of [0, 3, 4, 5]) jobs[index].resolve(index);
  await rejected;
  expect(upload).toHaveBeenCalledTimes(6);
  expect(finished).toHaveBeenCalledOnce();
});

it('does not start queued uploads after cancellation or return partial results', async () => {
  const controller = new AbortController();
  const jobs = Array.from({ length: 8 }, () => deferred<number>());
  const upload = vi.fn((job: typeof jobs[number]) => job.promise);
  const result = runPhotoUploads(jobs, controller.signal, upload);
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  jobs.slice(0, 6).forEach((job, index) => job.resolve(index));
  await rejected;
  expect(upload).toHaveBeenCalledTimes(6);
  upload.mockClear();
  await expect(runPhotoUploads(jobs, controller.signal, upload)).rejects.toMatchObject({ name: 'AbortError' });
  expect(upload).not.toHaveBeenCalled();
});

it('handles small and empty rolls without extra work', async () => {
  const upload = vi.fn(async (photo: number) => photo * 2);
  expect(await runPhotoUploads([], signal(), upload)).toEqual([]);
  expect(upload).not.toHaveBeenCalled();
  expect(await runPhotoUploads([1, 2], signal(), upload)).toEqual([2, 4]);
  expect(upload).toHaveBeenCalledTimes(2);
});
