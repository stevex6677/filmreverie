// Independent MP4 reader for export checks; it does not share code with the writer.
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);
export interface Mp4Box { type: string; start: number; size: number; body: DataView; children: Mp4Box[] }
export function parseBoxes(view: DataView, start = 0, end = view.byteLength): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  for (let offset = start; offset + 8 <= end;) {
    const size = view.getUint32(offset), type = String.fromCharCode(...[4, 5, 6, 7].map(i => view.getUint8(offset + i)));
    if (size < 8 || offset + size > end) throw new Error(`Invalid ${type} box at ${offset}`);
    const body = new DataView(view.buffer, view.byteOffset + offset + 8, size - 8);
    boxes.push({ type, start: offset, size, body, children: CONTAINERS.has(type) ? parseBoxes(view, offset + 8, offset + size) : [] });
    offset += size;
  }
  return boxes;
}
const find = (boxes: Mp4Box[], path: string[]): Mp4Box | undefined => {
  const [head, ...rest] = path, match = boxes.find(b => b.type === head);
  return !match || !rest.length ? match : find(match.children, rest);
};
const entries = (box: Mp4Box | undefined, width: number) => box ? Array.from({ length: box.body.getUint32(4) }, (_, i) => Array.from({ length: width }, (_, j) => box.body.getUint32(8 + (i * width + j) * 4))) : [];
export function readMp4(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = parseBoxes(view);
  const stbl = ['moov', 'trak', 'mdia', 'minf', 'stbl'];
  const tkhd = find(top, ['moov', 'trak', 'tkhd'])!, mdhd = find(top, ['moov', 'trak', 'mdia', 'mdhd'])!, mvhd = find(top, ['moov', 'mvhd'])!;
  const stsd = find(top, [...stbl, 'stsd'])!, stsz = find(top, [...stbl, 'stsz'])!, stco = find(top, [...stbl, 'stco'])!;
  const sampleEntry = String.fromCharCode(...[12, 13, 14, 15].map(i => stsd.body.getUint8(i)));
  const count = stsz.body.getUint32(8);
  const sizes = Array.from({ length: count }, (_, i) => stsz.body.getUint32(12 + i * 4));
  const mdat = top.find(b => b.type === 'mdat')!;
  const elst = find(top, ['moov', 'trak', 'edts', 'elst']);
  return {
    order: top.map(b => b.type), sampleEntry,
    width: tkhd.body.getUint32(76) / 65536, height: tkhd.body.getUint32(80) / 65536,
    movieTimescale: mvhd.body.getUint32(12), movieDuration: mvhd.body.getUint32(16),
    timescale: mdhd.body.getUint32(12), duration: mdhd.body.getUint32(16),
    stts: entries(find(top, [...stbl, 'stts']), 2), ctts: entries(find(top, [...stbl, 'ctts']), 2), keyframes: entries(find(top, [...stbl, 'stss']), 1).map(e => e[0]),
    sizes, chunkOffset: stco.body.getUint32(8), mdatData: mdat.start + 8, mdatSize: mdat.size - 8,
    editMediaTime: elst ? elst.body.getUint32(12) : null,
    hasAvcC: stsd.body.byteLength > 8 + 86 && String.fromCharCode(...[4, 5, 6, 7].map(i => stsd.body.getUint8(8 + 86 + i))) === 'avcC',
  };
}
