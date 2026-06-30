import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphPalette } from '../graph/styles/graph-styles';
import { Cube3DRenderer } from '../graph/renderers/cube-3d/cube-3d-renderer';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';

class Vector3 {
	x: number;
	y: number;
	z: number;

	constructor(x = 0, y = 0, z = 0) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	set(x: number, y: number, z: number): this {
		this.x = x;
		this.y = y;
		this.z = z;
		return this;
	}

	clone(): Vector3 {
		return new Vector3(this.x, this.y, this.z);
	}

	copy(other: Vector3): this {
		this.x = other.x;
		this.y = other.y;
		this.z = other.z;
		return this;
	}

	add(other: Vector3): this {
		this.x += other.x;
		this.y += other.y;
		this.z += other.z;
		return this;
	}

	sub(other: Vector3): this {
		this.x -= other.x;
		this.y -= other.y;
		this.z -= other.z;
		return this;
	}

	multiplyScalar(value: number): this {
		this.x *= value;
		this.y *= value;
		this.z *= value;
		return this;
	}

	normalize(): this {
		const length = Math.sqrt(this.lengthSq()) || 1;
		this.x /= length;
		this.y /= length;
		this.z /= length;
		return this;
	}

	lengthSq(): number {
		return this.x * this.x + this.y * this.y + this.z * this.z;
	}

	dot(other: Vector3): number {
		return this.x * other.x + this.y * other.y + this.z * other.z;
	}

	project(): this {
		return this;
	}

	transformDirection(): this {
		return this;
	}
}

class Vector2 {
	x = 0;
	y = 0;
}

class Object3D {
	children: Object3D[] = [];
	position = new Vector3();
	rotation = { set: vi.fn(), copy: vi.fn() };
	scale = {
		x: 1,
		y: 1,
		z: 1,
		set: vi.fn((x: number, y: number, z: number) => {
			this.scale.x = x;
			this.scale.y = y;
			this.scale.z = z;
		}),
	};
	renderOrder = 0;
	userData: Record<string, unknown> = {};

	add(...objects: Object3D[]): void {
		this.children.push(...objects);
	}

	remove(object: Object3D): void {
		this.children = this.children.filter((item) => item !== object);
	}

	localToWorld(position: Vector3): Vector3 {
		return position;
	}

	worldToLocal(position: Vector3): Vector3 {
		return position;
	}

	updateMatrixWorld(): void {}
}

class Group extends Object3D {}

class Scene extends Object3D {
	background: unknown;
}

class PerspectiveCamera extends Object3D {
	aspect = 1;
	fov: number;

	constructor(fov = 45) {
		super();
		this.fov = fov;
	}

	updateProjectionMatrix(): void {}
}

class BufferGeometry {
	setFromPoints(): this {
		return this;
	}

	dispose(): void {}
}

class Material {
	opacity = 1;
	transparent = false;
	rotation = 0;

	dispose(): void {}
}

class MeshBasicMaterial extends Material {
	constructor(_options?: unknown) {
		super();
	}
}

class LineBasicMaterial extends Material {
	constructor(_options?: unknown) {
		super();
	}
}

class SpriteMaterial extends Material {
	constructor(_options?: unknown) {
		super();
	}
}

class Mesh extends Object3D {
	geometry: BufferGeometry;
	material: Material;

	constructor(geometry = new BufferGeometry(), material = new Material()) {
		super();
		this.geometry = geometry;
		this.material = material;
	}

	lookAt(): void {}
}

class Line extends Object3D {
	geometry: BufferGeometry;
	material: Material;

	constructor(geometry = new BufferGeometry(), material = new Material()) {
		super();
		this.geometry = geometry;
		this.material = material;
	}
}

class Sprite extends Object3D {
	material: Material;

	constructor(material = new Material()) {
		super();
		this.material = material;
	}
}

class CanvasTexture {
	needsUpdate = false;

	constructor(_canvas: unknown) {}
	dispose(): void {}
}

class Plane {
	setFromNormalAndCoplanarPoint(): this {
		return this;
	}

	intersectPlane(_plane: Plane, target: Vector3): Vector3 {
		return target;
	}
}

class PlaneGeometry extends BufferGeometry {
	constructor(_width: number, _height: number) {
		super();
	}
}

class Raycaster {
	ray = new Plane();

	setFromCamera(): void {}
	intersectObjects(): unknown[] {
		return [];
	}
}

class WebGLRenderer {
	domElement = {
		className: '',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		remove: vi.fn(),
	};

	constructor(_options?: unknown) {}
	setPixelRatio(): void {}
	setSize(): void {}
	render(): void {}
	dispose(): void {}
}

class Color {
	constructor(_value: string) {}
}

class AmbientLight {
	constructor(_color: number, _intensity: number) {}
}

vi.mock('three', () => ({
	AmbientLight,
	BufferGeometry,
	CanvasTexture,
	Color,
	DoubleSide: 'DoubleSide',
	Group,
	Line,
	LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Plane,
	PlaneGeometry,
	Raycaster,
	Scene,
	Sprite,
	SpriteMaterial,
	Vector2,
	Vector3,
	WebGLRenderer,
}));

const palette: GraphPalette = {
	background: '#202020',
	node: '#ffffff',
	edge: '#999999',
	label: '#eeeeee',
	labelBackground: '#111111',
	mutedNode: '#666666',
	mutedEdge: '#555555',
	selected: '#ff0000',
};

function createContainer(): HTMLElement {
	const ownerDocument = {
		createElement: (tag: string) => {
			if (tag === 'canvas') {
				return {
					width: 0,
					height: 0,
					style: {},
					getContext: () => ({
						clearRect: vi.fn(),
						fillStyle: '',
						beginPath: vi.fn(),
						arc: vi.fn(),
						fill: vi.fn(),
						moveTo: vi.fn(),
						lineTo: vi.fn(),
						closePath: vi.fn(),
						font: '',
						measureText: (text: string) => ({
							width: text.length * 6,
						}),
						scale: vi.fn(),
						textBaseline: '',
						fillRect: vi.fn(),
						fillText: vi.fn(),
					}),
				};
			}
			return {};
		},
	};
	return {
		ownerDocument,
		appendChild: vi.fn(),
		getBoundingClientRect: () => ({
			width: 640,
			height: 480,
			left: 0,
			top: 0,
		}),
	} as unknown as HTMLElement;
}

function createGraph(nodeIds: string[]): RuntimeGraph {
	const nodeAttributes = new Map(
		nodeIds.map((id, index) => [
			id,
			{
				x: index * 0.2,
				y: index * 0.1,
				size: 10,
				color: '#44a37f',
				label: id,
				path: id,
				isPrimary: index === 0,
				isBend: false,
			},
		]),
	);
	return {
		nodes: () => [...nodeAttributes.keys()],
		edges: () => [],
		hasNode: (nodeId: string) => nodeAttributes.has(nodeId),
		getNodeAttributes: (nodeId: string) => nodeAttributes.get(nodeId),
		getNodeAttribute: (nodeId: string, key: string) =>
			(
				nodeAttributes.get(nodeId) as
					Record<string, unknown> | undefined
			)?.[key],
		mergeNodeAttributes: (
			nodeId: string,
			attributes: Record<string, unknown>,
		) => {
			const previous = nodeAttributes.get(nodeId);
			if (previous) {
				nodeAttributes.set(nodeId, { ...previous, ...attributes });
			}
		},
		getEdgeAttributes: vi.fn(),
		source: vi.fn(),
		target: vi.fn(),
		isDirected: vi.fn(() => false),
		forEachNode: vi.fn(),
	} as unknown as RuntimeGraph;
}

describe('Cube3DRenderer smoke', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			devicePixelRatio: 1,
			requestAnimationFrame: (callback: FrameRequestCallback) => {
				callback(0);
				return 1;
			},
			cancelAnimationFrame: vi.fn(),
		});
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(_callback: ResizeObserverCallback) {}
				observe(): void {}
				disconnect(): void {}
			},
		);
	});

	it('creates, updates graph and layout, then destroys without throwing', async () => {
		const renderer = await Cube3DRenderer.create(
			createGraph(['A.md', 'B.md']),
			createContainer(),
			palette,
			{ nodes: {}, groups: [] },
			1.5,
			14,
			'right',
			'',
			0.82,
			0.8,
			0.55,
			false,
			true,
		);

		expect(renderer).toBeDefined();
		expect(() => {
			renderer?.setGraph(createGraph(['C.md']));
			renderer?.setManualLayout({
				nodes: { 'C.md': { x: 0, y: 0, groupId: 'cube-front' } },
				groups: [],
			});
			renderer?.kill();
		}).not.toThrow();
	});
});
