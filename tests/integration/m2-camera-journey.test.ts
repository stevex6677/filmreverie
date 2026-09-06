import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAMERA_BOUNDS,
  DEFAULT_ROOM_POSE,
  clampRoomPose,
  sphericalToCartesian,
} from "../../src/utils/cameraBounds";
import {
  createInitialViewerState,
  viewerReducer,
} from "../../src/state/viewerState";

describe("M2 Integration — Camera Bounds, State Transitions & Pose Restoration", () => {
  describe("Camera Bounds & Mathematical Safety", () => {
    it("has sane camera bounds preventing wall and floor clipping", () => {
      expect(DEFAULT_CAMERA_BOUNDS.minYaw).toBeLessThan(0);
      expect(DEFAULT_CAMERA_BOUNDS.maxYaw).toBeGreaterThan(0);
      expect(DEFAULT_CAMERA_BOUNDS.minPitch).toBeGreaterThan(0.2); // above floor
      expect(DEFAULT_CAMERA_BOUNDS.maxPitch).toBeLessThan(Math.PI / 2); // below zenith
      expect(DEFAULT_CAMERA_BOUNDS.minDistance).toBeGreaterThanOrEqual(2.0); // table clearance
      expect(DEFAULT_CAMERA_BOUNDS.maxDistance).toBeLessThanOrEqual(4.5); // room clearance
    });

    it("clamps camera pose safely within bounds", () => {
      const clampedExtremeLeft = clampRoomPose({ yaw: -5.0, pitch: 0.5, distance: 3.0 });
      expect(clampedExtremeLeft.yaw).toBe(DEFAULT_CAMERA_BOUNDS.minYaw);

      const clampedExtremeRight = clampRoomPose({ yaw: 5.0, pitch: 0.5, distance: 3.0 });
      expect(clampedExtremeRight.yaw).toBe(DEFAULT_CAMERA_BOUNDS.maxYaw);

      const clampedTooLow = clampRoomPose({ yaw: 0, pitch: -2.0, distance: 3.0 });
      expect(clampedTooLow.pitch).toBe(DEFAULT_CAMERA_BOUNDS.minPitch);

      const clampedTooHigh = clampRoomPose({ yaw: 0, pitch: 3.0, distance: 3.0 });
      expect(clampedTooHigh.pitch).toBe(DEFAULT_CAMERA_BOUNDS.maxPitch);

      const clampedTooClose = clampRoomPose({ yaw: 0, pitch: 0.5, distance: 0.2 });
      expect(clampedTooClose.distance).toBe(DEFAULT_CAMERA_BOUNDS.minDistance);

      const clampedTooFar = clampRoomPose({ yaw: 0, pitch: 0.5, distance: 100.0 });
      expect(clampedTooFar.distance).toBe(DEFAULT_CAMERA_BOUNDS.maxDistance);
    });

    it("computes plausible 3D Cartesian coordinates from spherical pose", () => {
      const [x, y, z] = sphericalToCartesian(DEFAULT_ROOM_POSE, [0, 0, 0]);
      expect(typeof x).toBe("number");
      expect(typeof y).toBe("number");
      expect(typeof z).toBe("number");
      expect(x).toBeCloseTo(0, 4);
      expect(y).toBeGreaterThan(1.2); // standing viewing height
      expect(z).toBeGreaterThan(2.0); // comfortable distance from table
    });
  });

  describe("Legal State Transitions", () => {
    it("transitions from room to inspect on APPROACH_TABLE", () => {
      let state = createInitialViewerState("room");
      expect(state.roomMode).toBe("room");
      expect(state.isTransitioning).toBe(false);

      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state.roomMode).toBe("inspect");
      expect(state.isTransitioning).toBe(true);

      // Transition completes
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.isTransitioning).toBe(false);
      expect(state.roomMode).toBe("inspect");
    });

    it("transitions from inspect back to room on RETURN_TO_ROOM", () => {
      let state = createInitialViewerState("inspect");
      expect(state.roomMode).toBe("inspect");

      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      expect(state.roomMode).toBe("room");
      expect(state.isTransitioning).toBe(true);

      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.isTransitioning).toBe(false);
      expect(state.roomMode).toBe("room");
    });
  });

  describe("Repeated Approach & Competing Transition Protection", () => {
    it("ignores APPROACH_TABLE when already in inspect mode", () => {
      let state = createInitialViewerState("inspect");
      const beforeState = { ...state };
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state).toEqual(beforeState);
    });

    it("ignores RETURN_TO_ROOM when already in room mode", () => {
      let state = createInitialViewerState("room");
      const beforeState = { ...state };
      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      expect(state).toEqual(beforeState);
    });

    it("blocks competing transitions while isTransitioning is true", () => {
      let state = createInitialViewerState("room");
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state.isTransitioning).toBe(true);

      // Rapid secondary commands while in-flight must be ignored
      const lockedState = { ...state };
      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      expect(state).toEqual(lockedState);

      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      expect(state).toEqual(lockedState);
    });
  });

  describe("Room-Pose Restoration", () => {
    it("preserves and restores exact prior room pose after table inspection", () => {
      let state = createInitialViewerState("room");

      // User orbits camera in room mode
      state = viewerReducer(state, {
        type: "UPDATE_ROOM_POSE",
        pose: { yaw: 0.42, pitch: 0.75, distance: 3.4 },
      });
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.42, 4);
      expect(state.savedRoomPose.pitch).toBeCloseTo(0.75, 4);
      expect(state.savedRoomPose.distance).toBeCloseTo(3.4, 4);

      // Approach light table
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("inspect");

      // Interact with film viewer
      state = viewerReducer(state, { type: "TOGGLE_FILM_MODE" });
      state = viewerReducer(state, { type: "SELECT_FRAME", frameIndex: 3 });
      state = viewerReducer(state, { type: "SET_LOUPE_ACTIVE", active: true });

      // Return to room
      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("room");

      // Prior room pose must be fully intact
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.42, 4);
      expect(state.savedRoomPose.pitch).toBeCloseTo(0.75, 4);
      expect(state.savedRoomPose.distance).toBeCloseTo(3.4, 4);

      // Loupe must be resting in room view
      expect(state.loupe.isActive).toBe(false);

      // Repeat approach/return a second time
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("inspect");

      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("room");
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.42, 4);
    });
  });
});
