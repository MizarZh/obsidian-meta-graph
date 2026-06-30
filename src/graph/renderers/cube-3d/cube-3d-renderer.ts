import type * as Three from 'three';
import type {
	LabelPosition,
	ManualLayoutConfig,
} from '../../../core/types';
import {
	type CubeFace,
	type CubeFaceId,
	RUBIK_FACE_COLORS,
	createCubeFaces,
	getCubeFace,
	getCubeFaceIdForNode,
} from './cube-faces';
import {
	resolveCubeDisplayPositions,
	shouldShowCubeLabel,
} from './cube-display';
import {
	clamp,
	getCubeLocalLabelPosition,
	getCubeLocalPosition,
	getFaceVisibilityOpacity as readFaceVisibilityOpacity,
} from './cube-math';
import {
	CUBE_FACE_COORDINATE_LIMIT,
	CUBE_FACE_POINTER_LIMIT,
	CUBE_FACE_POSITION_SCALE,
} from './cube-constants';
import {
	createCubeArrowTexture,
	createCubeNodeSprite,
} from './cube-sprites';
import type { ThreeModule } from './cube-three';
import { immediateNeighborhood } from '../../model/neighborhood';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
} from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';
import {
	resolveThreeLabelStyle,
	type LabelThemeConfig,
} from '../renderer-label-style';
import {
	findClosestScreenNode,
	projectedToViewport,
	readViewportPosition,
} from '../renderer-interaction';
import { createThreeTextSprite } from '../renderer-labels';

interface CubeNodeObject {
	id: string;
	faceId: CubeFaceId;
	mesh: Three.Sprite;
	label?: Three.Sprite;
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
	private readonly arrowTextures = new Map<string, Three.CanvasTexture>();
	private readonly cubeSize = 180;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private animationFrame: number | undefined;
	private resizeObserver: ResizeObserver;
	private labelColor: string;
	private labelPosition: LabelPosition;
	private labelOffset: number;
	private labelTheme: LabelThemeConfig;
	private labelBackgroundOpacity: number;
	private labelSize: number;
	private labelDensity: number;
	private cubeFaceOpacity: number;
	private forceLabels: boolean;
	private manualLayout: ManualLayoutConfig;
	private killed = false;
	private readonly blockDoubleClick = (event: MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();
	};

	static async create(
		graph: RuntimeGraph,
		container: HTMLElement,
		palette: GraphPalette,
		manualLayout: ManualLayoutConfig,
		_fadeDistance = 1.5,
		labelSize = 14,
		labelPosition: LabelPosition = 'right',
		labelColor = '',
		labelBackgroundOpacity = 0.82,
		labelDensity = 0.8,
		cubeFaceOpacity = 0.55,
		_forceLayout = false,
		forceLabels = false,
		isStale: () => boolean = () => false,
		labelOffset = 1,
		labelLightTextColor = '#111111',
		labelLightBackgroundColor = '#ffffff',
		labelLightBackgroundOpacity = 0.82,
		labelDarkTextColor = '#ffffff',
		labelDarkBackgroundColor = '#000000',
		labelDarkBackgroundOpacity = 0.62,
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
			labelPosition,
			labelColor,
			labelBackgroundOpacity,
			labelDensity,
			cubeFaceOpacity,
			forceLabels,
			labelOffset,
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		);
	}

	private constructor(
		private readonly three: ThreeModule,
		private graph: RuntimeGraph,
		private readonly container: HTMLElement,
		private palette: GraphPalette,
		manualLayout: ManualLayoutConfig,
		labelSize: number,
		labelPosition: LabelPosition,
		labelColor: string,
		labelBackgroundOpacity: number,
		labelDensity: number,
		cubeFaceOpacity: number,
		forceLabels: boolean,
		labelOffset: number,
		labelLightTextColor: string,
		labelLightBackgroundColor: string,
		labelLightBackgroundOpacity: number,
		labelDarkTextColor: string,
		labelDarkBackgroundColor: string,
		labelDarkBackgroundOpacity: number,
	) {
		this.manualLayout = manualLayout;
		this.labelSize = labelSize;
		this.labelPosition = labelPosition;
		this.labelOffset = labelOffset;
		this.labelColor = labelColor;
		this.labelTheme = {
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		};
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.labelDensity = labelDensity;
		this.cubeFaceOpacity = cubeFaceOpacity;
		this.forceLabels = forceLabels;
		this.scene = new this.three.Scene();
		this.scene.background = new this.three.Color(
			this.palette.background ?? '#202020',
		);
		this.camera = new this.three.PerspectiveCamera(45, 1, 1, 2000);
		this.camera.position.set(0, 0, 620);
		this.webgl = new this.three.WebGLRenderer({
			antialias: true,
			alpha: true,
		});
		this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.webgl.domElement.className = 'meta-graph-cube-canvas';
		this.webgl.domElement.addEventListener(
			'dblclick',
			this.blockDoubleClick,
			{
				capture: true,
			},
		);
		this.container.appendChild(this.webgl.domElement);
		this.raycaster = new this.three.Raycaster();
		this.pointer = new this.three.Vector2();
		this.cubeGroup = new this.three.Group();
		this.edgeGroup = new this.three.Group();
		this.faceEdgeGroup = new this.three.Group();
		this.nodeGroup = new this.three.Group();
		this.labelGroup = new this.three.Group();
		this.faceEdgeGroup.renderOrder = 1;
		this.edgeGroup.renderOrder = 2;
		this.nodeGroup.renderOrder = 3;
		this.labelGroup.renderOrder = 4;
		this.cubeGroup.add(
			this.faceEdgeGroup,
			this.edgeGroup,
			this.nodeGroup,
			this.labelGroup,
		);
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
		this.scene.background = new this.three.Color(
			this.palette.background ?? '#202020',
		);
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

	setLabelPosition(labelPosition: LabelPosition): void {
		this.labelPosition = labelPosition;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelOffset(labelOffset: number): void {
		this.labelOffset = labelOffset;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.rebuildGraphObjects();
		this.scheduleRender();
	}

	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.labelTheme = labelTheme;
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
		this.webgl.domElement.removeEventListener(
			'dblclick',
			this.blockDoubleClick,
			{
				capture: true,
			},
		);
		if (this.animationFrame !== undefined) {
			window.cancelAnimationFrame(this.animationFrame);
			this.animationFrame = undefined;
		}
		this.resizeObserver.disconnect();
		this.clearObjectGroup(this.edgeGroup);
		this.clearObjectGroup(this.faceEdgeGroup);
		this.clearObjectGroup(this.nodeGroup);
		this.clearObjectGroup(this.labelGroup);
		this.arrowTextures.forEach((texture) => texture.dispose());
		this.arrowTextures.clear();
		this.webgl.dispose();
		this.webgl.domElement.remove();
	}

	getViewportPosition(event: MouseEvent | PointerEvent): {
		x: number;
		y: number;
	} {
		return readViewportPosition(this.container, event);
	}

	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		const intersects = this.raycastNodes(position);
		return (
			this.getObjectNodeId(intersects[0]?.object) ??
			this.getNearestNodeAtViewportPosition(position)
		);
	}

	getNodeViewportPosition(
		nodeId: string,
	): { x: number; y: number } | undefined {
		const node = this.nodeObjects.get(nodeId);
		if (!node) {
			return undefined;
		}
		this.updateWorldMatrices();
		const world = node.mesh.getWorldPosition(new this.three.Vector3());
		const projected = world.project(this.camera);
		return projectedToViewport(
			projected,
			this.container.getBoundingClientRect(),
		);
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
		this.camera.position.z = clamp(
			this.camera.position.z + deltaY * 0.45,
			260,
			1200,
		);
		this.scheduleRender();
	}

	dragNodeToViewport(
		nodeId: string,
		position: { x: number; y: number },
	): { x: number; y: number } | undefined {
		const node = this.nodeObjects.get(nodeId);
		if (!node) {
			return undefined;
		}
		const face = this.getFace(node.faceId);
		this.updateWorldMatrices();
		const ray = this.createRay(position);
		const planePoint = face.normal.clone().multiplyScalar(this.cubeSize);
		const worldPoint = this.cubeGroup.localToWorld(planePoint.clone());
		const worldNormal = face.normal
			.clone()
			.transformDirection(this.cubeGroup.matrixWorld);
		const plane = new this.three.Plane().setFromNormalAndCoplanarPoint(
			worldNormal,
			worldPoint,
		);
		const hit = ray.intersectPlane(plane, new this.three.Vector3());
		if (!hit) {
			return undefined;
			}
			const local = this.cubeGroup.worldToLocal(hit.clone());
			const range = this.cubeSize * CUBE_FACE_POSITION_SCALE;
			const rawX = local.dot(face.u) / range;
			const rawY = local.dot(face.v) / range;
			if (
				Math.abs(rawX) > CUBE_FACE_POINTER_LIMIT ||
				Math.abs(rawY) > CUBE_FACE_POINTER_LIMIT
			) {
				return this.getCurrentNodePlacement(nodeId);
			}
			const x = clamp(
				rawX,
				-CUBE_FACE_COORDINATE_LIMIT,
				CUBE_FACE_COORDINATE_LIMIT,
			);
			const y = clamp(
				rawY,
				-CUBE_FACE_COORDINATE_LIMIT,
				CUBE_FACE_COORDINATE_LIMIT,
			);
		this.manualLayout = {
			...this.manualLayout,
			nodes: {
				...this.manualLayout.nodes,
				[nodeId]: { x, y, groupId: node.faceId },
			},
		};
		this.graph.mergeNodeAttributes(nodeId, { x, y, fixed: true });
		node.mesh.position.copy(this.localPosition(face, x, y, 8));
		const radius = node.mesh.scale.x * 0.5;
		node.label?.position.copy(this.localLabelPosition(face, x, y, radius));
		this.rebuildEdges();
		this.scheduleRender();
		return { x, y };
	}

	getNodeManualPlacement(
		nodeId: string,
	): { x: number; y: number; groupId?: string } | undefined {
		return this.manualLayout.nodes[nodeId];
	}

	private getCurrentNodePlacement(nodeId: string):
		| { x: number; y: number }
		| undefined {
		const manual = this.manualLayout.nodes[nodeId];
		if (manual) {
			return { x: manual.x, y: manual.y };
		}
		const attributes = this.graph.getNodeAttributes(nodeId);
		return attributes ? { x: attributes.x, y: attributes.y } : undefined;
	}

	getNodeFace(nodeId: string): string | undefined {
		return this.nodeObjects.get(nodeId)?.faceId;
	}

	scheduleConnectionMove(
		update: (event: PointerEvent) => void,
		event: PointerEvent,
	): void {
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
			const group = this.manualLayout.groups.find(
				(item) => item.id === face.id,
			);
			const geometry = new this.three.PlaneGeometry(
				this.cubeSize * 2,
				this.cubeSize * 2,
			);
			const material = new this.three.MeshBasicMaterial({
				color: group?.color ?? RUBIK_FACE_COLORS[face.id],
				opacity: this.cubeFaceOpacity,
				transparent: this.cubeFaceOpacity < 1,
				depthWrite: false,
				depthTest: true,
			});
			const mesh = new this.three.Mesh(geometry, material);
			mesh.position.copy(
				face.normal.clone().multiplyScalar(this.cubeSize),
			);
			mesh.lookAt(face.normal.clone().multiplyScalar(this.cubeSize * 2));
			mesh.renderOrder = 0;
			mesh.userData.faceId = face.id;
			this.faceMeshes.set(face.id, mesh);
			this.cubeGroup.add(mesh);
			const edge = new this.three.Line(
				this.createFaceBorderGeometry(),
				new this.three.LineBasicMaterial({
					color: '#000000',
					transparent: true,
					opacity: 0.9,
					linewidth: 3,
				}),
			);
			edge.position.copy(
				face.normal.clone().multiplyScalar(this.cubeSize + 1),
			);
			edge.rotation.copy(mesh.rotation);
			edge.renderOrder = 1;
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
		const displayPositions = resolveCubeDisplayPositions(
			this.graph,
			this.manualLayout,
		);
		for (const nodeId of this.graph.nodes()) {
			const attributes = this.graph.getNodeAttributes(nodeId);
			if (attributes.isBend) {
				continue;
			}
			const display = displayPositions.get(nodeId);
			const faceId = display?.faceId ?? this.getFaceIdForNode(nodeId);
			const face = this.getFace(faceId);
			const position = display ??
				this.manualLayout.nodes[nodeId] ?? {
					x: attributes.x,
					y: attributes.y,
				};
			const nodeSize = Math.max(5, attributes.size * 1.25);
			const mesh = createCubeNodeSprite(
				this.three,
				this.container.ownerDocument,
				attributes.color,
				nodeSize,
			);
			mesh.position.copy(
				this.localPosition(face, position.x, position.y, 8),
			);
			mesh.renderOrder = 3;
			mesh.userData.nodeId = nodeId;
			this.nodeGroup.add(mesh);
			const label = shouldShowCubeLabel(
				attributes,
				this.labelDensity,
				this.forceLabels,
			)
				? this.createLabelSprite(
						attributes.label,
						this.labelSize,
						attributes.isPrimary ? 1.1 : 1,
					)
				: undefined;
			if (label) {
				label.position.copy(
					this.localLabelPosition(
						face,
						position.x,
						position.y,
						nodeSize,
					),
				);
				label.renderOrder = 4;
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
			line.renderOrder = 2;
			this.edgeGroup.add(line);
			if (this.graph.isDirected(edgeId)) {
				this.addArrow(start, end, attributes);
			}
			if (this.shouldShowLinkLabel(attributes)) {
				const label = this.createLabelSprite(
					attributes.label,
					Math.max(10, this.labelSize - 2),
					0.86,
				);
				label.position.copy(start.clone().add(end).multiplyScalar(0.5));
				label.renderOrder = 4;
				this.edgeGroup.add(label);
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
		const normalized = direction.normalize();
		const size = Math.max(14, attributes.size * 7);
		const material = new this.three.SpriteMaterial({
			map: this.getArrowTexture(attributes.color),
			transparent: true,
			opacity: 0.88,
			depthWrite: false,
			depthTest: false,
		});
		const arrow = new this.three.Sprite(material);
		arrow.position.copy(
			end
				.clone()
				.add(normalized.clone().multiplyScalar(-(16 + size * 0.35))),
		);
		arrow.scale.set(size, size, 1);
		arrow.userData.arrowStart = start.clone();
		arrow.userData.arrowEnd = end.clone();
		arrow.renderOrder = 2;
		this.edgeGroup.add(arrow);
	}

	private getArrowTexture(color: string): Three.CanvasTexture {
		const cached = this.arrowTextures.get(color);
		if (cached) {
			return cached;
		}
		const texture = createCubeArrowTexture(
			this.three,
			this.container.ownerDocument,
			color,
		);
		this.arrowTextures.set(color, texture);
		return texture;
	}

	private refreshNodeColors(): void {
		for (const [nodeId, node] of this.nodeObjects.entries()) {
			this.setObjectOpacity(
				node.mesh,
				this.getNodeOpacity(nodeId) *
					this.getFaceVisibilityOpacity(
						node.faceId,
						node.mesh.position,
					),
			);
			if (node.label) {
				this.setObjectOpacity(
					node.label,
					this.getNodeOpacity(nodeId) *
						this.getFaceVisibilityOpacity(
							node.faceId,
							node.label.position,
						),
				);
			}
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

	private localPosition(
		face: CubeFace,
		x: number,
		y: number,
		offset = 6,
	): Three.Vector3 {
		return getCubeLocalPosition(face, this.cubeSize, x, y, offset);
	}

	private localLabelPosition(
		face: CubeFace,
		x: number,
		y: number,
		nodeRadius: number,
	): Three.Vector3 {
		if (this.labelPosition === 'auto' || this.labelPosition === 'top') {
			return getCubeLocalLabelPosition(
				face,
				this.cubeSize,
				x,
				y,
				nodeRadius,
				this.labelSize * this.labelOffset,
			);
		}
		const base = this.localPosition(face, x, y, 9);
		const offset = nodeRadius + this.labelSize * this.labelOffset;
		if (this.labelPosition === 'center') {
			return base;
		}
		if (this.labelPosition === 'left') {
			return base.add(face.u.clone().multiplyScalar(-offset));
		}
		if (this.labelPosition === 'right') {
			return base.add(face.u.clone().multiplyScalar(offset));
		}
		return base.add(face.v.clone().multiplyScalar(-offset));
	}

	private createLabelSprite(
		text: string,
		size: number,
		scale: number,
	): Three.Sprite {
		const fontSize = Math.max(10, size);
		const labelStyle = resolveThreeLabelStyle(
			this.palette,
			this.labelTheme,
		);
		return createThreeTextSprite(this.three, {
			text,
			fontSize,
			textColor: labelStyle.textColor,
			backgroundColor: labelStyle.backgroundColor,
			ownerDocument: this.container.ownerDocument,
			paddingX: Math.ceil(fontSize * 0.45),
			paddingY: Math.ceil(fontSize * 0.45),
			scale,
			scaleMultiplier: 0.28,
		});
	}

	private shouldShowLinkLabel(attributes: RuntimeEdgeAttributes): boolean {
		return Boolean(attributes.label) && attributes.forceLabel && !attributes.hidden;
	}

	private getFaceVisibilityOpacity(
		faceId: CubeFaceId,
		localPosition: Three.Vector3,
	): number {
		const face = this.getFace(faceId);
		this.updateWorldMatrices();
		return readFaceVisibilityOpacity(
			face,
			localPosition,
			this.cubeGroup,
			this.camera,
		);
	}

	private setObjectOpacity(object: Three.Object3D, opacity: number): void {
		const material = (object as Three.Mesh).material;
		if (Array.isArray(material)) {
			for (const item of material) {
				item.opacity = opacity;
				item.transparent = true;
			}
			return;
		}
		if (material) {
			material.opacity = opacity;
			material.transparent = true;
		}
	}

	private getFaceIdForNode(nodeId: string): CubeFaceId {
		const placement = this.manualLayout.nodes[nodeId];
		return getCubeFaceIdForNode(nodeId, placement?.groupId);
	}

	private getFaces(): CubeFace[] {
		return createCubeFaces(this.three);
	}

	private getFace(faceId: CubeFaceId): CubeFace {
		return getCubeFace(this.getFaces(), faceId);
	}

	private raycastNodes(position: { x: number; y: number }) {
		this.updateWorldMatrices();
		this.createRay(position);
		return this.raycaster.intersectObjects(
			[...this.nodeObjects.values()].map((node) => node.mesh),
		);
	}

	private getObjectNodeId(
		object: Three.Object3D | undefined,
	): string | undefined {
		const userData = object?.userData as { nodeId?: unknown } | undefined;
		return typeof userData?.nodeId === 'string'
			? userData.nodeId
			: undefined;
	}

	private getNearestNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		const nodes = [...this.nodeObjects.entries()].flatMap(
			([nodeId, node]) => {
				const screen = this.getNodeViewportPosition(nodeId);
				return screen
					? [
							{
								id: nodeId,
								x: screen.x,
								y: screen.y,
								size: node.mesh.scale.x * 0.6,
							},
						]
					: [];
			},
		);
		return findClosestScreenNode(
			nodes,
			position,
			(node) => Math.max(16, node.size) + 10,
		);
	}

	private createRay(position: {
		x: number;
		y: number;
	}): Three.Raycaster['ray'] {
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
			this.updateArrowSprites();
			this.refreshNodeColors();
			this.webgl.render(this.scene, this.camera);
		});
	}

	private updateArrowSprites(): void {
		this.updateWorldMatrices();
		for (const object of this.edgeGroup.children) {
			if (!(object instanceof this.three.Sprite)) {
				continue;
			}
			const arrowData = object.userData as {
				arrowStart?: unknown;
				arrowEnd?: unknown;
			};
			const start = arrowData.arrowStart;
			const end = arrowData.arrowEnd;
			if (
				!(start instanceof this.three.Vector3) ||
				!(end instanceof this.three.Vector3)
			) {
				continue;
			}
			const startScreen = this.localToViewport(start);
			const endScreen = this.localToViewport(end);
			const material = object.material;
			material.rotation = -Math.atan2(
				endScreen.y - startScreen.y,
				endScreen.x - startScreen.x,
			);
		}
	}

	private localToViewport(position: Three.Vector3): { x: number; y: number } {
		const projected = this.cubeGroup
			.localToWorld(position.clone())
			.project(this.camera);
		return projectedToViewport(
			projected,
			this.container.getBoundingClientRect(),
		);
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

async function loadThree(): Promise<ThreeModule> {
	const module = await import('three');
	return module;
}
