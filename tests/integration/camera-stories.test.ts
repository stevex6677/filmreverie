import { describe, expect, it } from 'vitest';
import { CAMERAS } from '../../src/data/cameras';
import { CAMERA_STORIES } from '../../src/data/cameraStories';

describe('camera exhibit labels', () => {
  it.each(CAMERAS.map(camera => camera.id))('%s has a tagline, highlight and fun facts', id => {
    const story = CAMERA_STORIES[id];
    expect(story, `Add an exhibit label for ${id} in src/data/cameraStories.ts`).toBeDefined();
    expect(story.tagline.length).toBeGreaterThan(10);
    expect(story.special.length).toBeGreaterThan(80);
    expect(story.facts.length).toBeGreaterThanOrEqual(3);
    expect(new Set(story.facts).size).toBe(story.facts.length);
    // Catalog fields already render Introduced, Type and Lens shown.
    for (const spec of story.specs) expect(['Introduced', 'Type', 'Lens shown']).not.toContain(spec.label);
  });

  it('has no labels for cameras outside the shelf catalog', () => {
    expect(Object.keys(CAMERA_STORIES).sort()).toEqual(CAMERAS.map(camera => camera.id).sort());
  });
});
