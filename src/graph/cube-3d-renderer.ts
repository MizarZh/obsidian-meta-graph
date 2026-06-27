import type * as Three from "three";
import type { LabelPosition, ManualLayoutConfig } from "../core/types";
import {
	type ConnectionDragState,
	type GraphEventCallbacks,
	immediateNeighborhood,
} from "./graph-events";
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from "./graphology-adapter";
import type { GraphPalette } from "./graph-styles";

const FACE_IDS = [
	"cube-front",
	"cube-back",
	"cube-left",
	"cube-right",
	"cube-top",
	"cube-bottom",
] as const;

type CubeFaceId = (typeof FACE_IDS)[number];

interface CubeFace {
	id: CubeFaceId;
	name: string;
	normal: Three.Vector3;
	u: Three.Vector3;
	v: Three.Vector3;
}

interface CubeNodeObject {
	id: string;
	faceId: CubeFaceId;
	mesh: Three.Mesh;
	label?: Three.Sprite;
}

interface ThreeModule {
	AmbientLight: typeof Three.AmbientLight;
	ArrowHelper: typeof Three.ArrowHelper;
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
	SphereGeometry: typeof Three.SphereGeometry;
	Sprite: typeof Three.Sprite;
	SpriteMaterial: typeof Three.SpriteMaterial;
	Vector2: typeof Three.Vector2;
	Vector3: typeof Three.Vector3;
	WebGLRenderer: typeof Three.WebGLRenderer;
}

export class Cube3DRenderer {
	private readonly scene: Three.Scene;
	private readonly camera: Three.PerspectiveCamera;
	private readonly webgl: Three.WebGLRenderer;
	private readonly cubeGroup: Three.Group;
	private readonly nodeGroup: Three.Group;
	private readonly edgeGroup: Three.Group;
	private readonly faceEdgeGroup: Three.Group;
	private readonly labelGroup: Three.Group;
	private readonly raycaster: Three.Raycaster;
	private readonly pointer: Three.Vector2;
	private readonly nodeObjects = new Map<string, CubeNodeObject>();
	private readonly faceMeshes = new Map<CubeFaceId, Three.Mesh>();
	private readonly cubeSize = 180;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private animationFrame: number | undefined;
	private resizeObserver: ResizeObserver;
	private labelColor: string;
	private labelBackgroundOpacity: number;
	private labelSize: number;
	private labelDensity: number;
	private cubeFaceOpacity: number;
	private forceLabels: boolean;
	private manualLayout: ManualLayoutConfig;
	private killed = false;

	static async create(
		graph: RuntimeGraph,
		container: HTMLElement,
		palette: GraphPalette,
		manualLayout: ManualLayoutConfig,
		_fadeDistance = 1.5,
		labelSize = 14,
		_labelPosition: LabelPosition = "right",
		labelColor = "",
		labelBackgroundOpacity = 0.82,
		labelDensity = 0.8,
		cubeFaceOpacity = 0.55,
		_forceLayout = false,
		forceLabels = false,
		isStale: () => boolean = () => false,
	): Promise<Cube3DRenderer | undefined> {
		const three = await loadThree();
		if (isStale()) {
			return undefined;
		}
		return new Cube3DRenderer(
			three,
			graph,
			container,
			palette,
			manualLayout,
			labelSize,
			labelColor,
			labelBackgroundOpacity,
			labelDensity,
			cubeFaceOpacity,
			forceLabels,
		);
	}

	private constructor(
		private readonly three: ThreeModule,
		private graph: RuntimeGraph,
		private readonly container: HTMLElement,
		private palette: GraphPalette,
		manualLayout: ManualLayoutConfig,
		labelSize: number,
		labelColor: string,
		labelBackgroundOpacity: number,
		labelDensity: number,
		cubeFaceOpacity: number,
		forceLabels: boolean,
	) {
		this.manualLayout = manualLayout;
		this.labelSize = labelSize;
		this.labelColor = labelColor;
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.labelDensity = labelDensity;
		this.cubeFaceOpacity = cubeFaceOpacity;
		this.forceLabels = forceLabels;
		this.scene = new this.three.Scene();
		this.scene.background = new this.three.Color(this.palette.background ?? "#202020");
		this.camera = new this.three.PerspectiveCamera(45, 1, 1, 2000);
		this.camera.position.set(0, 0, 620);
		this.webgl = new this.three.WebGLRenderer({ antialias: true, alpha: true });
		this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.webgl.domElement.className = "meta-graph-cube-canvas";
		this.container.appendChild(this.webgl.domElement);
		this.raycaster = new this.three.Raycaster();
		this.pointer = new this.three.Vector2();
		this.cubeGroup = new this.three.Group();
		this.edgeGroup = new this.three.Group();
		this.faceEdgeGroup = new this.three.Group();
		this.nodeGroup = new this.three.Group();
		this.labelGroup = new this.three.Group();
		this.cubeGroup.add(this.faceEdgeGroup, this.edgeGroup, this.nodeGroup, this.labelGroup);
		this.scene.add(new this.three.AmbientLight(0xffffff, 1));
		this.scene.add(this.cubeGroup);
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.container);
		this.buildFaces();
		this.resize();
		this.setGraph(graph);
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	get element(): HTMLCanvasElement {
		return this.webgl.domElement;
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		if (this.pinnedNodeId && !graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		this.updateHoveredNeighborhood();
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setManualLayout(manualLayout: ManualLayoutConfig): void {
		this.manualLayout = manualLayout;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.scene.background = new this.three.Color(this.palette.background ?? "#202020");
		this.buildFaces();
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.refreshNodeColors();
		this.scheduleRender();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.refreshNodeColors();
		this.scheduleRender();
	}

	setFadeDistance(_fadeDistance: number): void {
		this.scheduleRender();
	}

	setLabelSize(labelSize: number): void {
		this.labelSize = labelSize;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelPosition(_labelPosition: LabelPosition): void {
		this.scheduleRender();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelDensity(labelDensity: number): void {
		this.labelDensity = labelDensity;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setCubeFaceOpacity(cubeFaceOpacity: number): void {
		this.cubeFaceOpacity = cubeFaceOpacity;
		this.buildFaces();
		this.scheduleRender();
	}

	setForceLabels(forceLabels: boolean): void {
		this.forceLabels = forceLabels;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setEnableForceLayout(_enableForceLayout: boolean): void {
		this.scheduleRender();
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.refreshNodeColors();
		this.scheduleRender();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.refreshNodeColors();
		this.scheduleRender();
	}

	focusNode(nodeId: string): void {
		const node = this.nodeObjects.get(nodeId);
		if (!node) {
			this.fit();
			return;
		}
		const target = node.mesh.position.clone().normalize();
		this.cubeGroup.rotation.set(-target.y * 0.8, target.x * 0.8, 0);
		this.scheduleRender();
	}

	resize(): void {
		const { width, height } = this.container.getBoundingClientRect();
		if (width <= 0 || height <= 0) {
			return;
		}
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.webgl.setSize(width, height, false);
		this.scheduleRender();
	}

	fit(): void {
		this.camera.position.set(0, 0, 620);
		this.cubeGroup.position.set(0, 0, 0);
		this.cubeGroup.rotation.set(-0.4, 0.65, 0);
		this.scheduleRender();
	}

	holdCurrentBounds(): void {
		// Sigma-only behavior.
	}

	clearHeldBounds(): void {
		// Sigma-only behavior.
	}

	kill(): void {
		this.killed = true;
		if (this.animationFrame !== undefined) {
			window.cancelAnimationFrame(this.animationFrame);
			this.animationFrame = undefined;
		}
		this.resizeObserver.disconnect();
		this.clearObjectGroup(this.edgeGroup);
		this.clearObjectGroup(this.faceEdgeGroup);
		this.clearObjectGroup(this.nodeGroup);
		this.clearObjectGroup(this.labelGroup);
		this.webgl.dispose();
		this.webgl.domElement.remove();
	}

	getViewportPosition(event: MouseEvent | PointerEvent): { x: number; y: number } {
		const rect = this.container.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	getNodeAtViewportPosition(position: { x: number; y: number }): string | undefined {
		const intersects = this.raycastNodes(position);
		return (
			this.getObjectNodeId(intersects[0]?.object) ??
			this.getNearestNodeAtViewportPosition(position)
		);
	}

	getNodeViewportPosition(nodeId: string): { x: number; y: number } | undefined {
		const node = this.nodeObjects.get(nodeId);
		if (!node) {
			return undefined;
		}
		this.updateWorldMatrices();
		const world = node.mesh.getWorldPosition(new this.three.Vector3());
		const projected = world.project(this.camera);
		const { width, height } = this.container.getBoundingClientRect();
		return {
			x: ((projected.x + 1) / 2) * width,
			y: ((1 - projected.y) / 2) * height,
		};
	}

	rotate(deltaX: number, deltaY: number): void {
		this.cubeGroup.rotation.y += deltaX * 0.008;
		this.cubeGroup.rotation.x += deltaY * 0.008;
		this.scheduleRender();
	}

	pan(deltaX: number, deltaY: number): void {
		const { width, height } = this.container.getBoundingClientRect();
		if (width <= 0 || height <= 0) {
			return;
		}
		const visibleHeight =
			2 *
			this.camera.position.z *
			Math.tan((this.camera.fov * Math.PI) / 360);
		const visibleWidth = visibleHeight * this.camera.aspect;
		this.cubeGroup.position.x += (deltaX / width) * visibleWidth;
		this.cubeGroup.position.y -= (deltaY / height) * visibleHeight;
		this.scheduleRender();
	}

	zoom(deltaY: number): void {
		this.camera.position.z = clamp(this.camera.position.z + deltaY * 0.45, 260, 1200);
		this.scheduleRender();
	}

	dragNodeToViewport(nodeId: string, position: { x: number; y: number }): { x: number; y: number } | undefined {
		const node = this.nodeObjects.get(nodeId);
		if (!node) {
			return undefined;
		}
		const face = this.getFace(node.faceId);
		this.updateWorldMatrices();
		const ray = this.createRay(position);
		const planePoint = face.normal.clone().multiplyScalar(this.cubeSize);
		const worldPoint = this.cubeGroup.localToWorld(planePoint.clone());
		const worldNormal = face.normal.clone().transformDirection(this.cubeGroup.matrixWorld);
		const plane = new this.three.Plane().setFromNormalAndCoplanarPoint(
			worldNormal,
			worldPoint,
		);
		const hit = ray.intersectPlane(plane, new this.three.Vector3());
		if (!hit) {
			return undefined;
		}
		const local = this.cubeGroup.worldToLocal(hit.clone());
		const range = this.cubeSize * 0.78;
		const x = clamp(local.dot(face.u) / range, -1, 1);
		const y = clamp(local.dot(face.v) / range, -1, 1);
		this.graph.mergeNodeAttributes(nodeId, { x, y, fixed: true });
		node.mesh.position.copy(this.localPosition(face, x, y));
		node.label?.position.copy(this.localPosition(face, x, y, 18));
		this.rebuildEdges();
		this.scheduleRender();
		return { x, y };
	}

	getNodeFace(nodeId: string): string | undefined {
		return this.nodeObjects.get(nodeId)?.faceId;
	}

	scheduleConnectionMove(update: (event: PointerEvent) => void, event: PointerEvent): void {
		update(event);
	}

	clearScheduledConnectionMove(): void {
		// Connection move is synchronous for cube.
	}

	private buildFaces(): void {
		for (const mesh of this.faceMeshes.values()) {
			this.cubeGroup.remove(mesh);
			this.disposeObject(mesh);
		}
		this.clearObjectGroup(this.faceEdgeGroup);
		this.faceMeshes.clear();
		for (const face of this.getFaces()) {
			const group = this.manualLayout.groups.find((item) => item.id === face.id);
			const geometry = new this.three.PlaneGeometry(this.cubeSize * 2, this.cubeSize * 2);
			const material = new this.three.MeshBasicMaterial({
				color: group?.color ?? this.palette.node,
				opacity: this.cubeFaceOpacity,
				transparent: this.cubeFaceOpacity < 1,
				depthWrite: true,
			});
			const mesh = new this.three.Mesh(
				geometry,
				material,
			);
			mesh.position.copy(face.normal.clone().multiplyScalar(this.cubeSize));
			mesh.lookAt(face.normal.clone().multiplyScalar(this.cubeSize * 2));
			mesh.userData.faceId = face.id;
			this.faceMeshes.set(face.id, mesh);
			this.cubeGroup.add(mesh);
			const edge = new this.three.Line(
				this.createFaceBorderGeometry(),
				new this.three.LineBasicMaterial({
					color: "#000000",
					transparent: true,
					opacity: 0.9,
					linewidth: 3,
				}),
			);
			edge.position.copy(face.normal.clone().multiplyScalar(this.cubeSize + 1));
			edge.rotation.copy(mesh.rotation);
			this.faceEdgeGroup.add(edge);
		}
	}

	private createFaceBorderGeometry(): Three.BufferGeometry {
		const half = this.cubeSize;
		return new this.three.BufferGeometry().setFromPoints([
			new this.three.Vector3(-half, -half, 0),
			new this.three.Vector3(half, -half, 0),
			new this.three.Vector3(half, half, 0),
			new this.three.Vector3(-half, half, 0),
			new this.three.Vector3(-half, -half, 0),
		]);
	}

	private rebuildGraphObjects(): void {
		this.clearObjectGroup(this.nodeGroup);
		this.clearObjectGroup(this.labelGroup);
		this.nodeObjects.clear();
		for (const nodeId of this.graph.nodes()) {
			const attributes = this.graph.getNodeAttributes(nodeId);
			if (attributes.isBend) {
				continue;
			}
			const faceId = this.getFaceIdForNode(nodeId);
			const face = this.getFace(faceId);
			const mesh = new this.three.Mesh(
				new this.three.SphereGeometry(Math.max(4, attributes.size), 18, 18),
				new this.three.MeshBasicMaterial({ color: attributes.color }),
			);
			mesh.position.copy(this.localPosition(face, attributes.x, attributes.y));
			mesh.userData.nodeId = nodeId;
			this.nodeGroup.add(mesh);
			const label = this.shouldShowLabel(attributes)
				? this.createTextSprite(attributes.label, this.labelSize, attributes)
				: undefined;
			if (label) {
				label.position.copy(this.localPosition(face, attributes.x, attributes.y, 18));
				this.labelGroup.add(label);
			}
			this.nodeObjects.set(nodeId, { id: nodeId, faceId, mesh, label });
		}
		this.rebuildEdges();
		this.refreshNodeColors();
	}

	private rebuildEdges(): void {
		this.clearObjectGroup(this.edgeGroup);
		for (const edgeId of this.graph.edges()) {
			const attributes = this.graph.getEdgeAttributes(edgeId);
			if (attributes.hidden) {
				continue;
			}
			const source = this.nodeObjects.get(this.graph.source(edgeId));
			const target = this.nodeObjects.get(this.graph.target(edgeId));
			if (!source || !target) {
				continue;
			}
			const start = source.mesh.position;
			const end = target.mesh.position;
			const material = new this.three.LineBasicMaterial({
				color: attributes.color,
				transparent: true,
				opacity: 0.72,
			});
			const geometry = new this.three.BufferGeometry().setFromPoints([
				start.clone(),
				end.clone(),
			]);
			const line = new this.three.Line(geometry, material);
			this.edgeGroup.add(line);
			if (this.graph.isDirected(edgeId)) {
				this.addArrow(start, end, attributes);
			}
		}
	}

	private addArrow(
		start: Three.Vector3,
		end: Three.Vector3,
		attributes: RuntimeEdgeAttributes,
	): void {
		const direction = end.clone().sub(start);
		if (direction.lengthSq() === 0) {
			return;
		}
		const length = Math.max(8, attributes.size * 5);
		const origin = end.clone().add(direction.normalize().multiplyScalar(-16));
		const arrow = new this.three.ArrowHelper(
			direction,
			origin,
			length,
			attributes.color,
			length,
			Math.max(4, length * 0.45),
		);
		this.edgeGroup.add(arrow);
	}

	private refreshNodeColors(): void {
		for (const [nodeId, node] of this.nodeObjects.entries()) {
			const attributes = this.graph.getNodeAttributes(nodeId);
			const material = node.mesh.material;
			if (!(material instanceof this.three.MeshBasicMaterial)) {
				continue;
			}
			material.color = new this.three.Color(attributes.color);
			material.opacity = this.getNodeOpacity(nodeId);
			material.transparent = material.opacity < 1;
		}
	}

	private getNodeOpacity(nodeId: string): number {
		if (!this.selectedNodeId && !this.hoveredNodeId && !this.pinnedNodeId) {
			return 0.96;
		}
		if (
			nodeId === this.selectedNodeId ||
			nodeId === this.hoveredNodeId ||
			nodeId === this.pinnedNodeId ||
			this.hoveredNeighborhood.has(nodeId)
		) {
			return 1;
		}
		return 0.2;
	}

	private updateHoveredNeighborhood(): void {
		const focusNodeId = this.pinnedNodeId ?? this.hoveredNodeId;
		this.hoveredNeighborhood = focusNodeId
			? immediateNeighborhood(this.graph, focusNodeId)
			: new Set();
	}

	private shouldShowLabel(attributes: RuntimeNodeAttributes): boolean {
		if (this.forceLabels || attributes.isPrimary) {
			return true;
		}
		return hashString(attributes.path) <= this.labelDensity;
	}

	private createTextSprite(
		text: string,
		size: number,
		attributes: RuntimeNodeAttributes,
	): Three.Sprite {
		const canvas = this.container.ownerDocument.createElement("canvas");
		const context = canvas.getContext("2d");
		const fontSize = Math.max(10, size);
		const padding = Math.ceil(fontSize * 0.45);
		const labelColor = this.labelColor || "#ffffff";
		if (!context) {
			return new this.three.Sprite(new this.three.SpriteMaterial());
		}
		context.font = `${fontSize}px sans-serif`;
		const width = Math.ceil(context.measureText(text).width + padding * 2);
		const height = Math.ceil(fontSize * 1.45 + padding);
		canvas.width = Math.max(1, width);
		canvas.height = Math.max(1, height);
		context.font = `${fontSize}px sans-serif`;
		context.fillStyle = `rgba(0, 0, 0, ${this.labelBackgroundOpacity})`;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = labelColor;
		context.textBaseline = "middle";
		context.fillText(text, padding, canvas.height / 2);
		const texture = new this.three.CanvasTexture(canvas);
		const material = new this.three.SpriteMaterial({
			map: texture,
			transparent: true,
			depthWrite: false,
			depthTest: true,
		});
		const sprite = new this.three.Sprite(material);
		const scale = attributes.isPrimary ? 1.1 : 1;
		sprite.scale.set(canvas.width * 0.28 * scale, canvas.height * 0.28 * scale, 1);
		return sprite;
	}

	private localPosition(
		face: CubeFace,
		x: number,
		y: number,
		offset = 6,
	): Three.Vector3 {
		const range = this.cubeSize * 0.78;
		return face.normal
			.clone()
			.multiplyScalar(this.cubeSize + offset)
			.add(face.u.clone().multiplyScalar(clamp(x, -1, 1) * range))
			.add(face.v.clone().multiplyScalar(clamp(y, -1, 1) * range));
	}

	private getFaceIdForNode(nodeId: string): CubeFaceId {
		const placement = this.manualLayout.nodes[nodeId];
		if (placement?.groupId && isCubeFaceId(placement.groupId)) {
			return placement.groupId;
		}
		return FACE_IDS[Math.floor(hashString(nodeId) * FACE_IDS.length)] ?? "cube-front";
	}

	private getFaces(): CubeFace[] {
		const v = this.three.Vector3;
		return [
			{
				id: "cube-front",
				name: "Front",
				normal: new v(0, 0, 1),
				u: new v(1, 0, 0),
				v: new v(0, 1, 0),
			},
			{
				id: "cube-back",
				name: "Back",
				normal: new v(0, 0, -1),
				u: new v(-1, 0, 0),
				v: new v(0, 1, 0),
			},
			{
				id: "cube-left",
				name: "Left",
				normal: new v(-1, 0, 0),
				u: new v(0, 0, 1),
				v: new v(0, 1, 0),
			},
			{
				id: "cube-right",
				name: "Right",
				normal: new v(1, 0, 0),
				u: new v(0, 0, -1),
				v: new v(0, 1, 0),
			},
			{
				id: "cube-top",
				name: "Top",
				normal: new v(0, 1, 0),
				u: new v(1, 0, 0),
				v: new v(0, 0, -1),
			},
			{
				id: "cube-bottom",
				name: "Bottom",
				normal: new v(0, -1, 0),
				u: new v(1, 0, 0),
				v: new v(0, 0, 1),
			},
		];
	}

	private getFace(faceId: CubeFaceId): CubeFace {
		const faces = this.getFaces();
		return faces.find((face) => face.id === faceId) ?? faces[0]!;
	}

	private raycastNodes(position: { x: number; y: number }) {
		this.updateWorldMatrices();
		this.createRay(position);
		return this.raycaster.intersectObjects(
			[...this.nodeObjects.values()].map((node) => node.mesh),
		);
	}

	private getObjectNodeId(object: Three.Object3D | undefined): string | undefined {
		const userData = object?.userData as { nodeId?: unknown } | undefined;
		return typeof userData?.nodeId === "string" ? userData.nodeId : undefined;
	}

	private getNearestNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let closestNodeId: string | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (const [nodeId, node] of this.nodeObjects.entries()) {
			const screen = this.getNodeViewportPosition(nodeId);
			if (!screen) {
				continue;
			}
			const distance = Math.hypot(screen.x - position.x, screen.y - position.y);
			const radius = Math.max(16, node.mesh.geometry.boundingSphere?.radius ?? 0);
			if (distance <= radius + 10 && distance < closestDistance) {
				closestDistance = distance;
				closestNodeId = nodeId;
			}
		}
		return closestNodeId;
	}

	private createRay(position: { x: number; y: number }): Three.Raycaster["ray"] {
		const { width, height } = this.container.getBoundingClientRect();
		if (width <= 0 || height <= 0) {
			return this.raycaster.ray;
		}
		this.pointer.x = (position.x / width) * 2 - 1;
		this.pointer.y = -(position.y / height) * 2 + 1;
		this.raycaster.setFromCamera(this.pointer, this.camera);
		return this.raycaster.ray;
	}

	private updateWorldMatrices(): void {
		this.camera.updateMatrixWorld(true);
		this.cubeGroup.updateMatrixWorld(true);
	}

	private scheduleRender(): void {
		if (this.killed || this.animationFrame !== undefined) {
			return;
		}
		this.animationFrame = window.requestAnimationFrame(() => {
			this.animationFrame = undefined;
			this.labelGroup.children.forEach((child) => {
				child.quaternion.copy(this.camera.quaternion);
			});
			this.webgl.render(this.scene, this.camera);
		});
	}

	private clearObjectGroup(group: Three.Group): void {
		for (const object of [...group.children]) {
			group.remove(object);
			this.disposeObject(object);
		}
	}

	private disposeObject(object: Three.Object3D): void {
		const mesh = object as Three.Mesh;
		const line = object as Three.Line;
		const geometry = mesh.geometry ?? line.geometry;
		geometry?.dispose();
		const material = mesh.material ?? line.material;
		if (Array.isArray(material)) {
			material.forEach((item) => item.dispose());
		} else {
			material?.dispose();
		}
	}
}

export function bindCube3DEvents(
	renderer: Cube3DRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const element = renderer.element;
	let connectionDrag: ConnectionDragState | undefined;
	let draggedNodeId: string | undefined;
	let draggedNodeMoved = false;
	let rotating = false;
	let rotated = false;
	let panning = false;
	let panned = false;
	let lastPointer: { x: number; y: number } | undefined;
	let suppressClickUntil = 0;
	let suppressContextMenuUntil = 0;

	const pointerDown = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		const nodeId = renderer.getNodeAtViewportPosition(point);
		lastPointer = { x: event.clientX, y: event.clientY };
		if (event.ctrlKey && event.button === 0 && nodeId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const source = renderer.getNodeViewportPosition(nodeId) ?? point;
			connectionDrag = {
				sourceNodeId: nodeId,
				x1: source.x,
				y1: source.y,
				x2: point.x,
				y2: point.y,
			};
			callbacks.onSelect(nodeId);
			callbacks.onConnectionDrag?.(connectionDrag);
			window.addEventListener("pointermove", pointerMove, { capture: true });
			window.addEventListener("pointerup", pointerUp, { capture: true });
			window.addEventListener("pointercancel", pointerCancel, { capture: true });
			return;
		}
		if (event.button === 2) {
			event.preventDefault();
			event.stopImmediatePropagation();
			panning = true;
			panned = false;
			window.addEventListener("pointermove", pointerMove, { capture: true });
			window.addEventListener("pointerup", pointerUp, { capture: true });
			window.addEventListener("pointercancel", pointerCancel, { capture: true });
			return;
		}
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		if (nodeId) {
			draggedNodeId = nodeId;
			draggedNodeMoved = false;
			callbacks.onSelect(nodeId);
		} else {
			rotating = true;
			rotated = false;
		}
		window.addEventListener("pointermove", pointerMove, { capture: true });
		window.addEventListener("pointerup", pointerUp, { capture: true });
		window.addEventListener("pointercancel", pointerCancel, { capture: true });
	};

	const pointerMove = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		if (connectionDrag) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const targetNodeId = renderer.getNodeAtViewportPosition(point);
			connectionDrag = {
				...connectionDrag,
				targetNodeId:
					targetNodeId && targetNodeId !== connectionDrag.sourceNodeId
						? targetNodeId
						: undefined,
				x2: point.x,
				y2: point.y,
			};
			callbacks.onConnectionDrag?.(connectionDrag);
			return;
		}
		if (draggedNodeId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const position = renderer.dragNodeToViewport(draggedNodeId, point);
			if (position) {
				draggedNodeMoved = true;
				callbacks.onNodeDrag?.(draggedNodeId, position);
			}
			return;
		}
		if (rotating && lastPointer) {
			event.preventDefault();
			event.stopImmediatePropagation();
			renderer.rotate(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
			lastPointer = { x: event.clientX, y: event.clientY };
			rotated = true;
			return;
		}
		if (panning && lastPointer) {
			event.preventDefault();
			event.stopImmediatePropagation();
			renderer.pan(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
			lastPointer = { x: event.clientX, y: event.clientY };
			panned = true;
			return;
		}
		callbacks.onHover(renderer.getNodeAtViewportPosition(point));
	};

	const pointerUp = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		const nodeId = renderer.getNodeAtViewportPosition(point);
		if (connectionDrag) {
			event.preventDefault();
			const { sourceNodeId, targetNodeId } = connectionDrag;
			endPointerState();
			if (targetNodeId && targetNodeId !== sourceNodeId) {
				callbacks.onConnect?.(sourceNodeId, targetNodeId);
			}
			return;
		}
		if (draggedNodeId) {
			event.preventDefault();
			const finishedNodeId = draggedNodeId;
			const moved = draggedNodeMoved;
			endPointerState();
			callbacks.onNodeDragEnd?.(finishedNodeId);
			if (!moved && Date.now() >= suppressClickUntil) {
				if (event.shiftKey) {
					renderer.togglePinnedHover(finishedNodeId);
				} else {
					callbacks.onSelect(finishedNodeId);
					callbacks.onOpen(finishedNodeId);
				}
			}
			suppressClickUntil = moved ? Date.now() + 500 : 0;
			return;
		}
		if (rotating) {
			event.preventDefault();
			const moved = rotated;
			endPointerState();
			if (!moved) {
				renderer.clearPinnedHover();
				callbacks.onSelect(undefined);
			}
			return;
		}
		if (panning) {
			event.preventDefault();
			const moved = panned;
			endPointerState();
			suppressContextMenuUntil = moved ? Date.now() + 500 : 0;
			return;
		}
		if (!nodeId) {
			renderer.clearPinnedHover();
			callbacks.onSelect(undefined);
		}
	};

	const pointerCancel = () => {
		endPointerState();
	};

	const wheel = (event: WheelEvent) => {
		event.preventDefault();
		renderer.zoom(event.deltaY);
	};

	const contextMenu = (event: MouseEvent) => {
		if (Date.now() < suppressContextMenuUntil) {
			event.preventDefault();
			return;
		}
		const nodeId = renderer.getNodeAtViewportPosition(renderer.getViewportPosition(event));
		event.preventDefault();
		if (!nodeId) {
			return;
		}
		callbacks.onSelect(nodeId);
	};

	function endPointerState(): void {
		if (connectionDrag) {
			callbacks.onConnectionDrag?.(undefined);
		}
		connectionDrag = undefined;
		draggedNodeId = undefined;
		draggedNodeMoved = false;
		rotating = false;
		rotated = false;
		panning = false;
		panned = false;
		lastPointer = undefined;
		window.removeEventListener("pointermove", pointerMove, { capture: true });
		window.removeEventListener("pointerup", pointerUp, { capture: true });
		window.removeEventListener("pointercancel", pointerCancel, { capture: true });
	}

	element.addEventListener("pointerdown", pointerDown, { capture: true });
	element.addEventListener("pointermove", pointerMove);
	element.addEventListener("wheel", wheel, { passive: false });
	element.addEventListener("contextmenu", contextMenu);

	return () => {
		endPointerState();
		element.removeEventListener("pointerdown", pointerDown, { capture: true });
		element.removeEventListener("pointermove", pointerMove);
		element.removeEventListener("wheel", wheel);
		element.removeEventListener("contextmenu", contextMenu);
	};
}

async function loadThree(): Promise<ThreeModule> {
	const module = await import("three");
	return module;
}

function isCubeFaceId(value: string): value is CubeFaceId {
	return (FACE_IDS as readonly string[]).includes(value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}
	return (hash % 10000) / 10000;
}
