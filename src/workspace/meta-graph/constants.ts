import type {
	ConnectionFieldMode,
	CuratedWorkspaceContext,
	DefaultLinkStyle,
	DefaultNodeStyle,
	LabelPosition,
	MetaGraphDock,
} from '../../core/types';

export const META_GRAPH_FRONTMATTER_KEY = 'meta-graph';
export const META_GRAPH_FRONTMATTER_VALUE = 'workspace';
export const META_GRAPH_VERSION_KEY = 'meta-graph-version';
export const META_GRAPH_VERSION = 1;
export const BASE_STYLE_RULE_ID = 'all';
export const DEFAULT_CONNECTION_FIELD = '';
export const DEFAULT_CONNECTION_FIELDS: string[] = [];
export const DEFAULT_CONNECTION_FIELD_MODE: ConnectionFieldMode = 'directed';
export const DEFAULT_LABEL_SIZE = 14;
export const DEFAULT_GRAPH_CENTER_FORCE = 1;
export const DEFAULT_GRAPH_REPEL_FORCE = 10;
export const DEFAULT_GRAPH_LINK_FORCE = 1;
export const DEFAULT_GRAPH_DRAG_LINK_FORCE = 1;
export const DEFAULT_GRAPH_RETURN_FORCE = 1;
export const DEFAULT_GRAPH_LINK_DISTANCE = 250;
export const DEFAULT_LABEL_POSITION: LabelPosition = 'auto';
export const DEFAULT_LABEL_OFFSET = 1;
export const DEFAULT_LABEL_COLOR = '';
export const DEFAULT_LABEL_LIGHT_TEXT_COLOR = '#111111';
export const DEFAULT_LABEL_LIGHT_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_LABEL_LIGHT_BACKGROUND_OPACITY = 0.82;
export const DEFAULT_LABEL_DARK_TEXT_COLOR = '#ffffff';
export const DEFAULT_LABEL_DARK_BACKGROUND_COLOR = '#000000';
export const DEFAULT_LABEL_DARK_BACKGROUND_OPACITY = 0.62;
export const DEFAULT_LABEL_BACKGROUND_OPACITY = 0.82;
export const DEFAULT_LABEL_DENSITY = 0.8;
export const DEFAULT_CUBE_FACE_OPACITY = 0.55;
export const DEFAULT_FORCE_LABELS = false;

export const BUILT_IN_DEFAULT_NODE_STYLE: Required<DefaultNodeStyle> = {
	color: '#7c6ff0',
	size: 7,
};

export const BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE: Required<DefaultNodeStyle> = {
	color: '#9ca3af',
	size: 6,
};

export const BUILT_IN_DEFAULT_LINK_STYLE: Required<DefaultLinkStyle> = {
	color: '#888888',
	size: 1.5,
	lineStyle: 'solid',
	label: '',
	showLabel: false,
	hidden: false,
};

export const BUILT_IN_DEFAULT_PLAIN_LINK_STYLE: Required<DefaultLinkStyle> = {
	color: '#666666',
	size: 1,
	lineStyle: 'dashed',
	label: '',
	showLabel: false,
	hidden: false,
};

export const BUILT_IN_DEFAULT_UNRESOLVED_LINK_STYLE: Required<DefaultLinkStyle> = {
	color: '#d97706',
	size: 1,
	lineStyle: 'dotted',
	label: '',
	showLabel: false,
	hidden: false,
};

export const DEFAULT_DOCK: MetaGraphDock = {
	templates: [],
	notes: [],
	dockWidth: 280,
	curatedPanelWidth: 300,
	focusOnSelect: true,
};

export const DEFAULT_CURATED_CONTEXT: CuratedWorkspaceContext = {
	enabled: false,
	depth: 0,
	includeOutgoingLinks: true,
	includeBacklinks: true,
	includeMetadataRelations: true,
};
