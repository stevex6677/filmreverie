import { lerpCamera, type CameraPose, type ScreeningTimeline } from './timeline';

/**
 * Join an uncut table tour with a C1, shape-preserving cubic path. Shared
 * velocities carry the camera through shot boundaries; monotone tangents keep
 * it inside the authored framing, without overshooting into another strip.
 * Distances interpolate in log space, as they do in the ordinary timeline.
 */
export function continuousPath(timeline: ScreeningTimeline): ScreeningTimeline {
  const segments = timeline.segments;
  const poses = [segments[0].camera[0], ...segments.map(s => s.camera[1])];
  const coordinates = (p: CameraPose) => [Math.log(p.zoom), p.pan.x, p.pan.z, p.tilt, p.yaw];
  const values = poses.map(coordinates);
  const slopes = segments.map((s, i) => values[i].map((v, axis) => (values[i + 1][axis] - v) / s.duration));
  const tangents = values.map((_, i) => values[0].map((__, axis) => {
    if (i === 0) return slopes[0][axis];
    if (i === segments.length) return slopes[i - 1][axis];
    const before = slopes[i - 1][axis], after = slopes[i][axis];
    if (before * after <= 0) return 0;
    const h0 = segments[i - 1].duration, h1 = segments[i].duration;
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / before + w1 / after);
  }));
  return { ...timeline, sample(requested) {
    const sample = timeline.sample(requested), i = sample.segment, segment = segments[i];
    const u = Math.max(0, Math.min(1, (sample.time - segment.start) / segment.duration));
    const u2 = u * u, u3 = u2 * u;
    const point = values[i].map((v, axis) => (2 * u3 - 3 * u2 + 1) * v
      + (u3 - 2 * u2 + u) * segment.duration * tangents[i][axis]
      + (-2 * u3 + 3 * u2) * values[i + 1][axis]
      + (u3 - u2) * segment.duration * tangents[i + 1][axis]);
    return { ...sample, camera: { ...lerpCamera(...segment.camera, u), zoom: Math.exp(point[0]),
      pan: { x: point[1], z: point[2] }, tilt: point[3], yaw: point[4] } };
  } };
}
