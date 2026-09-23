import { Group, Vector3, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export function loadModel(url: string, profile?: string, options?: { dracoDecoderPath?: string }): Promise<Group>;
export function mountModel(source: Group, rotation?: number[], width?: number): { object: Group; size: Vector3; scale: number };
export function studioEnvironment(renderer: WebGLRenderer): WebGLRenderTarget;
export function orbitControls(camera: PerspectiveCamera, canvas: HTMLElement, min?: number, max?: number): OrbitControls;
export const viewDirections: Record<'home' | 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom', number[]>;
export function fittedDistance(size: Vector3, aspect: number, fov?: number): number;
