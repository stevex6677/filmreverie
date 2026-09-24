import catalog from '../../standalone/model-viewer/models.json' with { type: 'json' };
type CatalogModel = (typeof catalog.models)[number];
type PhysicalCamera = Extract<CatalogModel, { widthMm: number }>;
// Standalone studies can omit physical dimensions and stay out of the app shelf.
export const CAMERAS = catalog.models.filter((model): model is PhysicalCamera =>
  typeof model.widthMm === 'number' && model.widthMm > 0
).map(model => ({
  ...model, name: [model.title, model.titleAccent].filter(Boolean).join(' '),
  url: `/assets/cameras/${model.id}-${model.sha256}.glb`,
  rotation: model.rotation,
}));
export const PRIMARY_CAMERA = CAMERAS[0];
export const cameraById = (id: string) => CAMERAS.find(camera => camera.id === id);
export type CameraEntry = (typeof CAMERAS)[number];
