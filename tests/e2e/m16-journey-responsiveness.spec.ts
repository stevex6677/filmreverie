import { test, expect } from "@playwright/test";

test.describe("Journey transition responsiveness (room <-> table)", () => {
  test("keeps UI controls and interactions responsive during room -> table and table -> room transitions", async ({
    page,
  }, info) => {
    // 1. Load app in room mode
    await page.goto("/guest?mode=room");
    const app = page.locator("main");
    await expect(app).toHaveAttribute("data-assets-ready", "true", { timeout: 30000 });
    await expect(app).toHaveAttribute("data-room-mode", "room");

    const isMobile = info.project.name.startsWith("mobile");

    if (isMobile) {
      // On mobile, room header has Rolls and Lights buttons
      const rollsBtn = page.getByRole("button", { name: "Rolls", exact: true });
      await expect(rollsBtn).toBeVisible();
      await expect(rollsBtn).toBeEnabled();

      // Enter table mode via keyboard Enter or canvas tap
      await page.locator(".canvas-wrapper").focus();
      await page.keyboard.press("Enter");
    } else {
      const approachBtn = page.locator('[data-testid="approach-table-btn"]');
      await expect(approachBtn).toBeVisible();
      await expect(approachBtn).toBeEnabled();
      await approachBtn.click();
    }

    // Verify room mode immediately changes to inspect and journey transition is active
    await expect(app).toHaveAttribute("data-room-mode", "inspect");
    await expect(app).toHaveAttribute("data-is-transitioning", "true");

    // 2. Verify controls are NOT disabled / frozen during the transition
    const returnRoomBtn = page.locator('[data-testid="return-room-btn"]');
    await expect(returnRoomBtn).toBeVisible();
    await expect(returnRoomBtn).toBeEnabled();

    const loupeBtn = page.locator('button:has-text("Loupe")');
    if (await loupeBtn.count() > 0) {
      await expect(loupeBtn).toBeEnabled();
    }

    const adjustBtn = page.getByRole("button", { name: "Adjust", exact: true });
    if (await adjustBtn.count() > 0) {
      await expect(adjustBtn).toBeEnabled();
    }

    // 3. Wait for transition to settle smoothly
    await expect(app).toHaveAttribute("data-is-transitioning", "false", { timeout: 5000 });
    await expect(app).toHaveAttribute("data-room-mode", "inspect");

    // 4. Trigger return to room
    await returnRoomBtn.click();

    await expect(app).toHaveAttribute("data-room-mode", "room");
    await expect(app).toHaveAttribute("data-is-transitioning", "true");

    // 5. Verify that during returning to room, controls are NOT disabled / frozen
    const rollsBtn = page.getByRole("button", { name: "Rolls", exact: true });
    await expect(rollsBtn).toBeVisible();
    await expect(rollsBtn).toBeEnabled();

    if (!isMobile) {
      const faceTableBtn = page.locator('button:has-text("Face table")');
      if (await faceTableBtn.count() > 0) {
        await expect(faceTableBtn).toBeEnabled();
      }
    }

    // 6. Wait for return journey to settle smoothly
    await expect(app).toHaveAttribute("data-is-transitioning", "false", { timeout: 5000 });
    await expect(app).toHaveAttribute("data-room-mode", "room");

    if (!isMobile) {
      const approachBtn = page.locator('[data-testid="approach-table-btn"]');
      await expect(approachBtn).toBeEnabled();
    }
  });
});
