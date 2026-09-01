import type { NodeFilterField, NodeFilterOperator } from './graph';

export type NodeStyleField = 'all' | NodeFilterField | 'group';
export type LinkStyleField = 'all' | 'relation' | 'source-field';
export type LinkLineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type LinkArrowStyle = 'filled' | 'chevron';
export type NodeShape =
	'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'star';

export interface NodeStyleRule {
	id: string;
	field: NodeStyleField;
	operator?: NodeFilterOperator;
	value: string;
	color: string;
	size: number;
	opacity?: number;
	shape?: NodeShape;
}

export interface LinkStyleRule {
	id: string;
	field: LinkStyleField;
	operator?: NodeFilterOperator;
	value: string;
	color: string;
	size: number;
	opacity?: number;
	lineStyle: LinkLineStyle;
	arrowStyle?: LinkArrowStyle;
	arrowSize?: number;
	label: string;
	showLabel: boolean;
	hidden: boolean;
}

export interface DefaultNodeStyle {
	color?: string;
	size?: number;
	opacity?: number;
	shape?: NodeShape;
}

export interface DefaultLinkStyle {
	color?: string;
	size?: number;
	opacity?: number;
	lineStyle?: LinkLineStyle;
	arrowStyle?: LinkArrowStyle;
	arrowSize?: number;
	label?: string;
	showLabel?: boolean;
	hidden?: boolean;
}

export interface ChartStyleConfig {
	nodeOverrides: DefaultNodeStyle;
	unresolvedNodeOverrides: DefaultNodeStyle;
	linkOverrides: DefaultLinkStyle;
	plainLinkOverrides: DefaultLinkStyle;
	unresolvedLinkOverrides: DefaultLinkStyle;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface GlobalStyleConfig {
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}
