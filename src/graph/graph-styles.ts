import type { RelationType } from '../core/types';

export interface GraphPalette {
	node: string;
	selected: string;
	edge: string;
	relatedEdge: string;
	mutedNode: string;
	mutedEdge: string;
	label: string;
}

export function readGraphPalette(container: HTMLElement): GraphPalette {
	const styles = getComputedStyle(container);
	const read = (name: string, fallback: string): string =>
		normalizeCssColor(
			container,
			styles.getPropertyValue(name).trim() || fallback,
			fallback,
		);

	return {
		node: read('--interactive-accent', '#7c6ff0'),
		selected: read('--color-orange', '#e08b36'),
		edge: read('--text-muted', '#888888'),
		relatedEdge: read('--color-cyan', '#3aa6b9'),
		mutedNode: read('--background-modifier-border', '#555555'),
		mutedEdge: read('--background-modifier-border', '#555555'),
		label: read('--text-normal', '#dddddd'),
	};
}

export function relationColor(
	relation: RelationType,
	palette: GraphPalette,
): string {
	return relation === 'related' ? palette.relatedEdge : palette.edge;
}

function normalizeCssColor(
	container: HTMLElement,
	color: string,
	fallback: string,
): string {
	const probe = container.createSpan({
		cls: 'knowledge-workspace-color-probe',
		attr: { 'aria-hidden': 'true' },
	});
	probe.style.color = color;
	const normalized = getComputedStyle(probe).color;
	probe.remove();
	return normalized || fallback;
}
