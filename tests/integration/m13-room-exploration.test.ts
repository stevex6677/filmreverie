import { describe, expect, it } from "vitest";
import { createInitialViewerState, viewerReducer } from "../../src/state/viewerState";
import { ROOM_EYE, ROOM_ENVELOPE, MAX_INSPECT_DISTANCE, TABLE_SURFACE_Y, DEFAULT_ROOM_POSE, clampRoomPose, roomLookTarget } from "../../src/utils/cameraBounds";
import { BASELINE_ROLL } from "../../src/utils/rollLayout";

describe("M13 fixed standing room and independent illumination", () => {
  it("holds the eye inside a complete envelope with a near-plane margin", () => {
    expect(TABLE_SURFACE_Y + MAX_INSPECT_DISTANCE + .1).toBeLessThan(ROOM_ENVELOPE.ceiling);
    expect(ROOM_EYE[0]).toBeGreaterThan(-ROOM_ENVELOPE.width / 2 + .1);
    expect(ROOM_EYE[0]).toBeLessThan(ROOM_ENVELOPE.width / 2 - .1);
    expect(ROOM_EYE[1]).toBeGreaterThan(ROOM_ENVELOPE.floor + .1);
    expect(ROOM_EYE[1]).toBeLessThan(ROOM_ENVELOPE.ceiling - .1);
    expect(ROOM_EYE[2]).toBeGreaterThan(ROOM_ENVELOPE.front + .1);
    expect(ROOM_EYE[2]).toBeLessThan(ROOM_ENVELOPE.back - .1);
    for (const yaw of [-20 * Math.PI, -Math.PI - .01, Math.PI + .01, 20 * Math.PI]) {
      for (const pitch of [-100, 0, 100]) {
        const pose = clampRoomPose({yaw, pitch, distance: 100});
        expect(pose.yaw).toBe(yaw);
        expect(pose.distance).toBe(DEFAULT_ROOM_POSE.distance);
        const target = roomLookTarget(pose);
        expect(target.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...target.map((v,i) => v - ROOM_EYE[i]))).toBeCloseTo(1);
      }
    }
    expect(clampRoomPose({yaw:NaN,pitch:Infinity,distance:NaN})).toEqual(DEFAULT_ROOM_POSE);
  });
  it("crosses the yaw seam continuously and repeats full turns without reversing", () => {
    const a = roomLookTarget({...DEFAULT_ROOM_POSE, yaw: Math.PI - .001});
    const b = roomLookTarget({...DEFAULT_ROOM_POSE, yaw: Math.PI + .001});
    expect(Math.hypot(...a.map((v,i)=>v-b[i]))).toBeLessThan(.003);
    const c = roomLookTarget({...DEFAULT_ROOM_POSE, yaw: DEFAULT_ROOM_POSE.yaw + 8 * Math.PI});
    roomLookTarget(DEFAULT_ROOM_POSE).forEach((v,i)=>expect(c[i]).toBeCloseTo(v));
  });
  it("guards transitions, restores steep room headings, and faces the table without resetting other controls", () => {
    let state=createInitialViewerState("room");
    state=viewerReducer(state,{type:"UPDATE_ROOM_POSE",pose:{yaw: 5*Math.PI, pitch:1.4}});
    const pose=state.savedRoomPose;
    state=viewerReducer(state,{type:"APPROACH_TABLE"});
    expect(viewerReducer(state,{type:"LOOK_ROOM",yaw:1,pitch:1})).toEqual(state);
    expect(viewerReducer(state,{type:"FACE_TABLE"})).toEqual(state);
    state=viewerReducer(state,{type:"SET_TRANSITIONING",isTransitioning:false});
    state=viewerReducer(state,{type:"RETURN_TO_ROOM"});
    state=viewerReducer(state,{type:"SET_TRANSITIONING",isTransitioning:false});
    expect(state.savedRoomPose).toEqual(pose);
    const reset=viewerReducer(state,{type:"FACE_TABLE"});
    expect(reset.savedRoomPose).toEqual(DEFAULT_ROOM_POSE);
    expect({...reset,savedRoomPose:pose}).toEqual(state);
  });
  it("remembers nonzero light output and preserves room settings across roll loads", () => {
    let state=createInitialViewerState("room");
    const initial=state;
    state=viewerReducer(state,{type:"SET_ROOM_BRIGHTNESS",brightness:.73});
    expect({...state,roomBrightness:initial.roomBrightness,lastRoomBrightness:initial.lastRoomBrightness}).toEqual(initial);
    state=viewerReducer(state,{type:"SET_ROOM_BRIGHTNESS",brightness:0});
    expect(state.lastRoomBrightness).toBe(.73);
    state=viewerReducer(state,{type:"TOGGLE_ROOM_LIGHTS"}); expect(state.roomBrightness).toBe(.73);
    state=viewerReducer(state,{type:"TOGGLE_ROOM_LIGHTS"}); expect(state.roomBrightness).toBe(0);
    state=viewerReducer(state,{type:"SET_ROOM_BRIGHTNESS",brightness:5}); expect(state.roomBrightness).toBe(1);
    state=viewerReducer(state,{type:"SET_ROOM_BRIGHTNESS",brightness:-1}); expect(state.roomBrightness).toBe(0);
    expect(viewerReducer(state,{type:"SET_ROOM_BRIGHTNESS",brightness:NaN})).toEqual(state);
    state=viewerReducer(state,{type:"UPDATE_ROOM_POSE",pose:{yaw:8,pitch:-1}});
    const loaded=viewerReducer(state,{type:"LOAD_ROLL",roll:BASELINE_ROLL});
    expect(loaded.roomBrightness).toBe(0); expect(loaded.lastRoomBrightness).toBe(1);
    expect(loaded.savedRoomPose).toEqual(state.savedRoomPose);
  });
});
