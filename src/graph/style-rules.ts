import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
} from '../core/types';

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
	const value = rule.value.trim().toLocaleLowerCase();
	if (!value) {
		return false;
	}
	switch (rule.field) {
		case 'folder':
			return (
				node.folder.toLocaleLowerCase() === value ||
				node.folder.toLocaleLowerCase().startsWith(`${value}/`)
			);
		case 'tag':
			return node.tags.some((tag) => tag.toLocaleLowerCase() === value);
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
	const value = rule.value.trim().toLocaleLowerCase();
	if (!value) {
		return false;
	}
	return rule.field === 'relation'
		? edge.relation.toLocaleLowerCase() === value
		: edge.sourceField.toLocaleLowerCase() === value;
}
