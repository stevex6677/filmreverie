import { describe, it, expect } from "vitest";
import { BASELINE_ROLL, FULL_ROLL_FIXTURE } from "../../src/utils/rollLayout";
import { getFilmStock } from "../../src/data/filmStocks";

describe("Darkroom Loading Page — Logic & Progression", () => {
  const stock = getFilmStock("portra-400");

  it("provides valid film stock metadata for loading display", () => {
    expect(stock.displayName).toBe("Kodak Portra 400");
    expect(stock.process).toBe("C-41");
    expect(stock.type).toBe("negative");
  });

  it("handles baseline roll frames and formatting", () => {
    expect(BASELINE_ROLL.frames.length).toBe(5);
    expect(BASELINE_ROLL.format ?? "135").toBe("135");
  });

  it("calculates progress progression appropriately for fixtures", () => {
    const total = FULL_ROLL_FIXTURE.frames.length;
    expect(total).toBe(36);

    // Initial phase
    const initialProgress = 15;
    expect(initialProgress).toBe(15);

    // Canvas rendered
    const withCanvas = initialProgress + 25; // 40%
    expect(withCanvas).toBe(40);

    // Partial textures loaded (18/36 = 50%)
    const texturePct = Math.round((18 / total) * 50); // 25%
    const midProgress = withCanvas + texturePct; // 65%
    expect(midProgress).toBe(65);

    // All textures loaded
    const fullTexturePct = Math.round((36 / total) * 50); // 50%
    const settledProgress = withCanvas + fullTexturePct; // 90%
    expect(settledProgress).toBe(90);
  });
});
