// Decode real shipped geometry in Node using Three's bundled Draco WASM.
// Textures are omitted by callers because Node has no browser image decoder.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { BufferAttribute, BufferGeometry } from 'three';
import type { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
let modulePromise: Promise<any>;
function decoderModule() {
  if (!modulePromise) {
    const context = createContext({ console, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout });
    const dir = 'node_modules/three/examples/jsm/libs/draco/gltf/';
    runInContext(readFileSync(dir + 'draco_wasm_wrapper.js', 'utf8'), context);
    modulePromise = context.DracoDecoderModule({ wasmBinary: readFileSync(dir + 'draco_decoder.wasm') });
  }
  return modulePromise;
}
export const nodeDraco = {
  preload() {},
  decodeDracoFile(bytes: ArrayBuffer, onLoad: (geometry: BufferGeometry) => void, ids: Record<string, number>, _types: unknown, _colors: unknown, onError: (error: unknown) => void) {
    return decoderModule().then(d => {
      const decoder = new d.Decoder(), buffer = new d.DecoderBuffer(), mesh = new d.Mesh();
      try {
        buffer.Init(new Int8Array(bytes), bytes.byteLength);
        const status = decoder.DecodeBufferToMesh(buffer, mesh);
        const ok = status.ok(); const message = ok ? '' : status.error_msg(); d.destroy(status);
        if (!ok) throw new Error(message);
        const geometry = new BufferGeometry();
        for (const [name, id] of Object.entries(ids)) {
          const attribute = decoder.GetAttributeByUniqueId(mesh, id), values = new d.DracoFloat32Array();
          try {
            decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
            const array = new Float32Array(values.size());
            for (let i = 0; i < array.length; i++) array[i] = values.GetValue(i);
            geometry.setAttribute(name, new BufferAttribute(array, attribute.num_components()));
          } finally { d.destroy(values); }
        }
        const size = mesh.num_faces() * 3 * 4, pointer = d._malloc(size);
        try {
          decoder.GetTrianglesUInt32Array(mesh, size, pointer);
          geometry.setIndex(new BufferAttribute(new Uint32Array(d.HEAPU32.buffer, pointer, size / 4).slice(), 1));
        } finally { d._free(pointer); }
        onLoad(geometry);
      } finally { d.destroy(mesh); d.destroy(buffer); d.destroy(decoder); }
    }).catch(onError);
  },
} as unknown as DRACOLoader;
