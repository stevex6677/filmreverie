// Controls can invalidate synchronously from update(). Keep the current frame
// marked as scheduled throughout drawing so that event never starts a second
// animation chain. Only the end of the frame schedules its successor.
export function createRenderLoop(draw, continuous = () => false, scheduler = {
  request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id),
}) {
  let frame = null, remaining = 0, disposed = false;
  function tick(time) {
    if (disposed) return;
    remaining--;
    draw(time);
    frame = null;
    if (!disposed && (remaining > 0 || continuous())) frame = scheduler.request(tick);
  }
  return {
    invalidate() { if (disposed) return; remaining = 24; if (frame === null) frame = scheduler.request(tick); },
    pause() { if (frame !== null) scheduler.cancel(frame); frame = null; remaining = 0; },
    dispose() { disposed = true; this.pause(); },
  };
}
