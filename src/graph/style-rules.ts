import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
} from '../core/types';
import { matchesNodeCriterion } from '../query/filters';

export interface NodeStyle {
	color: string;
	size: number;
}

export interface LinkStyle {
	color: string;
	size: number;
	lineStyle: LinkLineStyle;
	label: string;
	hidden: boolean;
}

export function resolveNodeStyle(
	node: KnowledgeNode,
	rules: NodeStyleRule[],
	defaults: NodeStyle,
): NodeStyle {
	return rules.reduce(
		(style, rule) =>
			matchesNodeRule(node, rule)
				? { color: rule.color || style.color, size: rule.size }
				: style,
		{ ...defaults },
	);
}

export function resolveLinkStyle(
	edge: KnowledgeEdge,
	rules: LinkStyleRule[],
	defaults: LinkStyle,
): LinkStyle {
	return rules.reduce(
		(style, rule) =>
			matchesLinkRule(edge, rule)
				? {
						color: rule.color || style.color,
						size: rule.size,
						lineStyle: rule.lineStyle,
						label: rule.showLabel
							? rule.label.trim() || edge.relation
							: '',
						hidden: rule.hidden,
					}
				: style,
		{ ...defaults },
	);
}

function matchesNodeRule(node: KnowledgeNode, rule: NodeStyleRule): boolean {
	if (rule.field === 'all') {
		return true;
	}
	const value = rule.value.trim().toLocaleLowerCase();
	const operator = rule.operator ?? 'is';
	if (!value && operator !== 'has-value' && operator !== 'empty') {
		return false;
	}
	switch (rule.field) {
		case 'folder':
		case 'tag':
		case 'file.name':
		case 'file.basename':
		case 'file.path':
		case 'file.folder':
		case 'file.ext':
		case 'file.links':
		case 'file.tags':
		case 'metadata-field':
			return matchesNodeCriterion(node, rule.field, operator, rule.value);
		case 'domain':
			return node.domains.some(
				(domain) => domain.toLocaleLowerCase() === value,
			);
		case 'type':
			return node.noteType?.toLocaleLowerCase() === value;
		case 'title':
			return node.title.toLocaleLowerCase() === value;
	}
}

function matchesLinkRule(edge: KnowledgeEdge, rule: LinkStyleRule): boolean {
	if (rule.field === 'all') {
		return true;
	}
	const value = rule.value.trim().toLocaleLowerCase();
	if (!value) {
		return false;
	}
	return rule.field === 'relation'
		? edge.relation.toLocaleLowerCase() === value
		: edge.sourceField.toLocaleLowerCase() === value;
}
