/** App-side exhibit labels for the camera display. The shared catalog keeps
 *  model, provenance and viewer metadata; these notes are editorial copy. */
export type CameraStory = {
  /** One-line reason the camera is worth a closer look. */
  tagline: string;
  /** Short paragraph on what sets the camera apart. */
  special: string;
  /** Additional specifications shown after the catalog's introduction year and type. */
  specs: { label: string; value: string }[];
  /** Small, verifiable details to discover while turning the model. */
  facts: string[];
};

export const CAMERA_STORIES: Record<string, CameraStory> = {
  'mamiya-universal': {
    tagline: 'One body, almost any film you can feed it.',
    special: 'The Universal is less a camera than a hub. Lenses, grip, viewfinder and film back all detach, so the same body can shoot 6×9 roll film in the morning and instant Polaroid pack film in the afternoon.',
    specs: [
      { label: 'Film', value: '120 / 220 roll film · Polaroid pack' },
      { label: 'Shutter', value: 'Leaf shutter in every lens' },
    ],
    facts: [
      'Polaroid pack film backs mount directly on the Universal without an adapter, which made it a favourite instant-film camera long after press photography moved on.',
      'Every lens carries its own leaf shutter, released on the lens itself, so flash synchronises at every speed.',
      'Its rangefinder shows switchable bright-line frames for the 100, 150 and 250 mm lenses and corrects them for parallax automatically.',
      'It was the final model of the Mamiya Press family that began in 1960.',
    ],
  },
  'minolta-autocord': {
    tagline: 'A twin-lens reflex you focus with one finger.',
    special: 'Most twin-lens reflexes focus with a knob on the side. The Autocord moves its whole lens board with a small lever below the taking lens, so you can hold the camera at waist level and focus without shifting your grip.',
    specs: [
      { label: 'Film', value: '120 roll film · 6×6 cm' },
      { label: 'Taking lens', value: 'Rokkor 75 mm f/3.5' },
    ],
    facts: [
      'The upper lens is only for viewing: you compose on a ground-glass screen while the lower lens takes the picture.',
      'Its four-element Rokkor taking lens follows the classic Tessar design and is still praised for its sharpness.',
      'Collectors have documented at least 17 minor variations over the camera’s 1955–1966 production run.',
      'That clever focusing lever is also the Autocord’s one notable weak link: its metal is brittle and vulnerable to breaking.',
    ],
  },
  'canon-demi-ee17': {
    tagline: 'Seventy-two pictures from a thirty-six-exposure roll.',
    special: 'Demi is French for “half”. Each 18 × 24 mm frame uses half of a standard 35 mm frame, doubling the pictures per roll. The EE17 paired this economy with an unusually fast f/1.7 lens and automatic exposure.',
    specs: [
      { label: 'Frame', value: '18 × 24 mm half frame' },
      { label: 'Exposure', value: 'Shutter-priority auto (CdS)' },
    ],
    facts: [
      'Holding the camera normally gives a vertical picture, so neighbouring frames on the negative often become accidental diptychs.',
      'You choose the shutter speed and the CdS meter sets the aperture, with a needle and aperture scale shown in the viewfinder.',
      'Focusing uses symbols for near, medium and far subjects rather than a rangefinder.',
      'The SH 30 mm f/1.7 lens has six elements in four groups, a bright specification for a pocket half-frame camera.',
    ],
  },
  'canon-7s': {
    tagline: 'The last chapter of Canon’s rangefinder story.',
    special: 'The 7s refined the Canon 7 with a CdS meter, an accessory shoe and a relocated tripod socket. With its quietly improved 7sZ revision, it closed Canon’s line of interchangeable-lens rangefinders in 1968.',
    specs: [
      { label: 'Mount', value: '39 mm screw · outer bayonet' },
      { label: 'Shutter', value: '1 s – 1/1000 s focal-plane' },
    ],
    facts: [
      'Its outer bayonet existed for a single lens: the legendary Canon 50 mm f/0.95.',
      'Every other lens uses the 39 mm screw mount, which is why this display can wear a Voigtländer Color-Skopar made decades later.',
      'Canon never announced the later 7sZ revision, so collectors identify it by the position of a small adjusting port on the top plate.',
      'The built-in meter’s top-plate scale stops at ASA 400.',
    ],
  },
  'olympus-om1': {
    tagline: 'The SLR that made small serious.',
    special: 'Yoshihisa Maitani’s team set out to shrink the professional SLR. The OM-1 launched as the world’s smallest and lightest 35 mm SLR, yet kept one of the largest, brightest viewfinders of its era.',
    specs: [
      { label: 'Shutter', value: 'Mechanical focal-plane' },
      { label: 'Metering', value: 'Full-aperture TTL CdS' },
    ],
    facts: [
      'It was launched as the M-1 in 1972 and renamed OM-1 after a complaint from Leica, maker of the M-series.',
      'Shutter speed is set with a ring around the lens mount; the top dial only sets film speed.',
      'An air damper cushions the mirror, reducing the shutter’s noise and vibration.',
      'The battery only powers the light meter, so the fully mechanical shutter works without one.',
    ],
  },
};

export const cameraStory = (id: string): CameraStory | undefined => CAMERA_STORIES[id];
