import type * as Three from 'three';

export interface ThreeModule {
	AmbientLight: typeof Three.AmbientLight;
	BufferGeometry: typeof Three.BufferGeometry;
	CanvasTexture: typeof Three.CanvasTexture;
	Color: typeof Three.Color;
	DoubleSide: typeof Three.DoubleSide;
	Group: typeof Three.Group;
	Line: typeof Three.Line;
	LineBasicMaterial: typeof Three.LineBasicMaterial;
	Mesh: typeof Three.Mesh;
	MeshBasicMaterial: typeof Three.MeshBasicMaterial;
	PerspectiveCamera: typeof Three.PerspectiveCamera;
	Plane: typeof Three.Plane;
	PlaneGeometry: typeof Three.PlaneGeometry;
	Raycaster: typeof Three.Raycaster;
	Scene: typeof Three.Scene;
	Sprite: typeof Three.Sprite;
	SpriteMaterial: typeof Three.SpriteMaterial;
	Vector2: typeof Three.Vector2;
	Vector3: typeof Three.Vector3;
	WebGLRenderer: typeof Three.WebGLRenderer;
}
