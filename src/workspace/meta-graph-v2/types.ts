import type {
	ArcDirection,
	ArcLabelAngle,
	ChartGroupMode,
	ChartGroupShape,
	ChartSource,
	ConnectionFieldMode,
	DefaultLinkStyle,
	DefaultNodeStyle,
	FlowDirection,
	FlowEdgeStyle,
	FlowRelationRule,
	LabelPosition,
	LayoutNodeSort,
	LayoutSortDirection,
	LinkStyleRule,
	NodeFilterGroup,
	NodeStyleRule,
	ThreeLabelResolution,
} from '../../core/types';

export interface PersistedMetaGraphDocumentV2 {
	defaultChart: string;
	shared: PersistedSharedConfigV2;
	connections: PersistedConnectionsV2;
	resources: PersistedResourcesV2;
	charts: PersistedChartV2[];
	extensions?: Record<string, unknown>;
}

export interface PersistedSharedConfigV2 {
	filters: {
		nodes: NodeFilterGroup;
		relations: string[];
	};
	style: {
		node: Required<DefaultNodeStyle>;
		link: Required<DefaultLinkStyle>;
		nodeRules: NodeStyleRule[];
		linkRules: LinkStyleRule[];
	};
}

export interface PersistedConnectionsV2 {
	default?: string;
	fields?: Array<{
		property: string;
		mode: ConnectionFieldMode;
	}>;
}

export interface PersistedResourcesV2 {
	pinnedNotes?: string[];
	templates?: Array<{
		id: string;
		label: string;
		template: string;
		targetFolder: string;
	}>;
}

interface PersistedChartBaseV2 {
	id: string;
	name: string;
	content: PersistedChartContentV2;
	nodes?: Record<string, PersistedChartNodeV2>;
	groups?: PersistedGroupV2[];
	display: PersistedDisplayV2;
	presentation: PersistedPresentationV2;
	templateOverrides?: Record<string, PersistedTemplateOverrideV2>;
	style?: PersistedChartStyleV2;
	extensions?: Record<string, unknown>;
}

export type PersistedChartV2 = PersistedChartBaseV2 &
	(
		| { type: 'graph'; layout: PersistedForceLayoutV2 }
		| { type: 'graph-3d'; layout: PersistedForceLayoutV2 }
		| { type: 'cube'; layout: PersistedForceLayoutV2 }
		| { type: 'free'; layout: PersistedBaseLayoutV2 }
		| { type: 'flow'; layout: PersistedFlowLayoutV2 }
		| { type: 'arc'; layout: PersistedArcLayoutV2 }
		| {
				type: 'hierarchical-edge-bundling';
				layout: PersistedHierarchicalEdgeBundlingLayoutV2;
		  }
	);

export interface PersistedChartContentV2 {
	source: ChartSource;
	links?: {
		plain: boolean;
		unresolved: boolean;
	};
	query?: {
		roots?: string[];
		traversal?: {
			depth?: number;
			direction?: 'incoming' | 'outgoing' | 'both';
		};
		relations?: string[];
		limit?: number;
		includeIsolated?: boolean;
		filter?: NodeFilterGroup;
	};
}

export interface PersistedBaseLayoutV2 {
	spacing?: number;
}

export interface PersistedChartNodeV2 {
	curated?: true;
	hidden?: true;
	note?: string;
	x?: number;
	y?: number;
	group?: string | null;
}

export interface PersistedForceLayoutV2 extends PersistedBaseLayoutV2 {
	forces?: {
		center?: number;
		repel?: number;
		link?: number;
		dragLink?: number;
		return?: number;
		linkDistance?: number;
	};
}

export interface PersistedFlowLayoutV2 extends PersistedBaseLayoutV2 {
	layerSpacing?: number;
	laneSpacing?: number;
	direction?: FlowDirection;
	flowRelationRules?: FlowRelationRule[];
	edgeStyle?: FlowEdgeStyle;
}

export interface PersistedArcLayoutV2 extends PersistedBaseLayoutV2 {
	arcDirection?: ArcDirection;
	arcLabelAngle?: ArcLabelAngle;
	nodeSort?: LayoutNodeSort;
	nodeSortDirection?: LayoutSortDirection;
}

export interface PersistedHierarchicalEdgeBundlingLayoutV2 extends PersistedBaseLayoutV2 {
	nodeSort?: LayoutNodeSort;
	nodeSortDirection?: LayoutSortDirection;
}

export interface PersistedGroupV2 {
	id: string;
	name: string;
	color: string;
	/** Omitted for Cube's fixed system groups. */
	mode?: ChartGroupMode;
	shape: ChartGroupShape;
	padding: number;
	rule?: NodeFilterGroup;
	frame?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
}

export interface PersistedDisplayV2 {
	fadeDistance: number;
	labels?: {
		size?: number;
		threeResolution?: ThreeLabelResolution;
		bold?: boolean;
		italic?: boolean;
		position?: LabelPosition;
		offset?: number;
		color?: string;
		lightTextColor?: string;
		lightBackgroundColor?: string;
		lightBackgroundOpacity?: number;
		darkTextColor?: string;
		darkBackgroundColor?: string;
		darkBackgroundOpacity?: number;
		backgroundOpacity?: number;
		density?: number;
		force?: boolean;
	};
	cube?: {
		faceOpacity?: number;
		size?: number;
		freeCamera?: boolean;
	};
	forceLayout?: boolean;
}

export interface PersistedPresentationV2 {
	panels: {
		filters: boolean;
		inspector: boolean;
	};
	widths: {
		dock: number;
		curated: number;
	};
	focusOnSelect: boolean;
}

export interface PersistedTemplateOverrideV2 {
	defaultGroup: string;
}

export interface PersistedChartStyleV2 {
	node?: DefaultNodeStyle;
	unresolvedNode?: DefaultNodeStyle;
	link?: DefaultLinkStyle;
	plainLink?: DefaultLinkStyle;
	unresolvedLink?: DefaultLinkStyle;
	nodeRules?: NodeStyleRule[];
	linkRules?: LinkStyleRule[];
}

export interface WorkspacePersistenceContext {
	defaultChart: string;
	defaultConnection: string;
	presentationByChart: Record<string, PersistedPresentationV2>;
	templateOverridesByChart: Record<
		string,
		Record<string, PersistedTemplateOverrideV2>
	>;
	extensions?: Record<string, unknown>;
	chartExtensions?: Record<string, Record<string, unknown>>;
	sourceVersion: number;
	readOnly: boolean;
}

export interface ParsedMetaGraphWorkspace {
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- persisted domain model, not a DOM Document
	document: import('../../core/types').MetaGraphDocument;
	persistence: WorkspacePersistenceContext;
}

export interface WorkspaceChartSessionState {
	showFilters?: boolean;
	showInspector?: boolean;
	dockWidth?: number;
	curatedPanelWidth?: number;
	focusOnSelect?: boolean;
}

export interface WorkspaceSessionState {
	activeChart?: string;
	activeConnection?: string;
	charts?: Record<string, WorkspaceChartSessionState>;
	shell?: {
		rightPanelTab?: WorkspaceRightPanelTab;
		dockOpen?: boolean;
		curatedPanelOpen?: boolean;
		connectionOpen?: boolean;
	};
}

export type WorkspaceRightPanelTab = 'details' | 'pinned' | 'templates';
