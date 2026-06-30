import type { NodeFilterOperator } from './graph';

export type NodeStyleField =
	| 'all'
	| 'folder'
	| 'tag'
	| 'file.name'
	| 'file.basename'
	| 'file.path'
	| 'file.folder'
	| 'file.ext'
	| 'file.links'
	| 'file.tags'
	| 'metadata-field'
	| 'domain'
	| 'type'
	| 'title';
export type LinkStyleField = 'all' | 'relation' | 'source-field';
export type LinkLineStyle = 'solid' | 'dashed' | 'dotted';

export interface NodeStyleRule {
	id: string;
	field: NodeStyleField;
	operator?: NodeFilterOperator;
	value: string;
	color: string;
	size: number;
}

export interface LinkStyleRule {
	id: string;
	field: LinkStyleField;
	value: string;
	color: string;
	size: number;
	lineStyle: LinkLineStyle;
	label: string;
	showLabel: boolean;
	hidden: boolean;
}

export interface DefaultNodeStyle {
	color?: string;
	size?: number;
}

export interface DefaultLinkStyle {
	color?: string;
	size?: number;
	lineStyle?: LinkLineStyle;
	label?: string;
	showLabel?: boolean;
	hidden?: boolean;
}

export interface ChartStyleConfig {
	nodeOverrides: DefaultNodeStyle;
	linkOverrides: DefaultLinkStyle;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface GlobalStyleConfig {
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}
