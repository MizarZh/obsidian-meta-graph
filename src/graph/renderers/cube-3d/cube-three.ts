import type * as Three from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export interface ThreeModule {
	AmbientLight: typeof Three.AmbientLight;
	BufferGeometry: typeof Three.BufferGeometry;
	CanvasTexture: typeof Three.CanvasTexture;
	Color: typeof Three.Color;
	DoubleSide: typeof Three.DoubleSide;
	Group: typeof Three.Group;
	Line: typeof Three.Line;
	Line2: typeof Line2;
	LineBasicMaterial: typeof Three.LineBasicMaterial;
	LineGeometry: typeof LineGeometry;
	LineMaterial: typeof LineMaterial;
	Mesh: typeof Three.Mesh;
	MeshBasicMaterial: typeof Three.MeshBasicMaterial;
	PerspectiveCamera: typeof Three.PerspectiveCamera;
	Plane: typeof Three.Plane;
	PlaneGeometry: typeof Three.PlaneGeometry;
	Quaternion: typeof Three.Quaternion;
	Raycaster: typeof Three.Raycaster;
	Scene: typeof Three.Scene;
	Sprite: typeof Three.Sprite;
	SpriteMaterial: typeof Three.SpriteMaterial;
	Vector2: typeof Three.Vector2;
	Vector3: typeof Three.Vector3;
	WebGLRenderer: typeof Three.WebGLRenderer;
}
