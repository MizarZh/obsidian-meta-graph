import type { NodeFilterField, NodeFilterOperator } from './graph';

export type NodeStyleField = 'all' | NodeFilterField | 'group';
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
	operator?: NodeFilterOperator;
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
	plainLinkOverrides: DefaultLinkStyle;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface GlobalStyleConfig {
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}
