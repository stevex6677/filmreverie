import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAMERA_BOUNDS,
  DEFAULT_ROOM_POSE,
  INSPECT_CAMERA_DISTANCE,
  INSPECT_CAMERA_POSITION,
  INSPECT_CAMERA_TARGET,
  INSPECT_CAMERA_UP,
  ROOM_CAMERA_TARGET,
  ROOM_CAMERA_UP,
  TABLE_TILT_ANGLE,
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
      expect(DEFAULT_CAMERA_BOUNDS.minPitch).toBeGreaterThan(0.04); // above workbench & floor
      expect(DEFAULT_CAMERA_BOUNDS.maxPitch).toBeLessThan(Math.PI / 4); // below steep overhead
      expect(DEFAULT_CAMERA_BOUNDS.minDistance).toBeGreaterThanOrEqual(2.5); // table clearance
      expect(DEFAULT_CAMERA_BOUNDS.maxDistance).toBeLessThanOrEqual(4.5); // room clearance
    });

    it("clamps camera pose safely within bounds", () => {
      const clampedExtremeLeft = clampRoomPose({ yaw: -5.0, pitch: 0.2, distance: 3.5 });
      expect(clampedExtremeLeft.yaw).toBe(DEFAULT_CAMERA_BOUNDS.minYaw);

      const clampedExtremeRight = clampRoomPose({ yaw: 5.0, pitch: 0.2, distance: 3.5 });
      expect(clampedExtremeRight.yaw).toBe(DEFAULT_CAMERA_BOUNDS.maxYaw);

      const clampedTooLow = clampRoomPose({ yaw: 0, pitch: -2.0, distance: 3.5 });
      expect(clampedTooLow.pitch).toBe(DEFAULT_CAMERA_BOUNDS.minPitch);

      const clampedTooHigh = clampRoomPose({ yaw: 0, pitch: 3.0, distance: 3.5 });
      expect(clampedTooHigh.pitch).toBe(DEFAULT_CAMERA_BOUNDS.maxPitch);

      const clampedTooClose = clampRoomPose({ yaw: 0, pitch: 0.2, distance: 0.2 });
      expect(clampedTooClose.distance).toBe(DEFAULT_CAMERA_BOUNDS.minDistance);

      const clampedTooFar = clampRoomPose({ yaw: 0, pitch: 0.2, distance: 100.0 });
      expect(clampedTooFar.distance).toBe(DEFAULT_CAMERA_BOUNDS.maxDistance);
    });

    it("computes plausible 3D Cartesian coordinates from spherical pose", () => {
      const [x, y, z] = sphericalToCartesian(DEFAULT_ROOM_POSE, [0, 0, 0]);
      expect(typeof x).toBe("number");
      expect(typeof y).toBe("number");
      expect(typeof z).toBe("number");
      expect(x).toBeGreaterThan(0.4); // gentle 3/4 architectural perspective
      expect(y).toBeGreaterThan(0.4); // eye-level viewing elevation
      expect(z).toBeGreaterThan(3.0); // comfortable distance from table
    });

    it("defines ROOM_CAMERA_TARGET for natural eye-level room overview framing", () => {
      expect(ROOM_CAMERA_TARGET[0]).toBe(0);
      expect(ROOM_CAMERA_TARGET[1]).toBeLessThan(0); // slightly below table center to frame workbench & legs
      expect(ROOM_CAMERA_TARGET[2]).toBe(0);
      const [rx, ry, rz] = sphericalToCartesian(DEFAULT_ROOM_POSE, ROOM_CAMERA_TARGET);
      expect(rx).toBeGreaterThan(0.4);
      expect(ry).toBeGreaterThan(0.0); // eye-level viewing elevation
      expect(rz).toBeGreaterThan(3.5);
    });

    it("defines 25 deg console tilt with mathematically perpendicular inspect camera pose", () => {
      expect(TABLE_TILT_ANGLE).toBeCloseTo((25 * Math.PI) / 180, 5);

      // Inspect camera distance equals 3.2
      const inspectDist = Math.hypot(
        INSPECT_CAMERA_POSITION[0] - INSPECT_CAMERA_TARGET[0],
        INSPECT_CAMERA_POSITION[1] - INSPECT_CAMERA_TARGET[1],
        INSPECT_CAMERA_POSITION[2] - INSPECT_CAMERA_TARGET[2]
      );
      expect(inspectDist).toBeCloseTo(INSPECT_CAMERA_DISTANCE, 5);

      // Inspect camera is angled along table normal (y > 0, z > 0)
      expect(INSPECT_CAMERA_POSITION[0]).toBe(0);
      expect(INSPECT_CAMERA_POSITION[1]).toBeGreaterThan(1.3);
      expect(INSPECT_CAMERA_POSITION[2]).toBeGreaterThan(2.8);

      // Camera Up vector is a normalized unit vector tilted to align with table plane local Y
      const upLen = Math.hypot(...INSPECT_CAMERA_UP);
      expect(upLen).toBeCloseTo(1.0, 5);
      expect(INSPECT_CAMERA_UP[0]).toBe(0);
      expect(INSPECT_CAMERA_UP[1]).toBeGreaterThan(0.9);
      expect(INSPECT_CAMERA_UP[2]).toBeLessThan(-0.4);

      // View direction vector (from camera to target) is perpendicular to Up vector
      const viewDir = [
        INSPECT_CAMERA_TARGET[0] - INSPECT_CAMERA_POSITION[0],
        INSPECT_CAMERA_TARGET[1] - INSPECT_CAMERA_POSITION[1],
        INSPECT_CAMERA_TARGET[2] - INSPECT_CAMERA_POSITION[2],
      ];
      const dot =
        viewDir[0] * INSPECT_CAMERA_UP[0] +
        viewDir[1] * INSPECT_CAMERA_UP[1] +
        viewDir[2] * INSPECT_CAMERA_UP[2];
      expect(Math.abs(dot)).toBeLessThan(1e-10);

      // Room mode camera up is world standard +Y
      expect(ROOM_CAMERA_UP).toEqual([0, 1, 0]);
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
        pose: { yaw: 0.30, pitch: 0.22, distance: 3.6 },
      });
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.30, 4);
      expect(state.savedRoomPose.pitch).toBeCloseTo(0.22, 4);
      expect(state.savedRoomPose.distance).toBeCloseTo(3.6, 4);

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
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.30, 4);
      expect(state.savedRoomPose.pitch).toBeCloseTo(0.22, 4);
      expect(state.savedRoomPose.distance).toBeCloseTo(3.6, 4);

      // Loupe must be resting in room view
      expect(state.loupe.isActive).toBe(false);

      // Repeat approach/return a second time
      state = viewerReducer(state, { type: "APPROACH_TABLE" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("inspect");

      state = viewerReducer(state, { type: "RETURN_TO_ROOM" });
      state = viewerReducer(state, { type: "SET_TRANSITIONING", isTransitioning: false });
      expect(state.roomMode).toBe("room");
      expect(state.savedRoomPose.yaw).toBeCloseTo(0.30, 4);
      expect(state.savedRoomPose.pitch).toBeCloseTo(0.22, 4);
      expect(state.savedRoomPose.distance).toBeCloseTo(3.6, 4);
    });
  });
});
