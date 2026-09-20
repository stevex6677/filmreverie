export function createRenderLoop(draw: (time: number) => void, continuous?: () => boolean,
  scheduler?: { request: (callback: (time: number) => void) => number; cancel: (id: number) => void }):
  { invalidate(): void; pause(): void; dispose(): void };
