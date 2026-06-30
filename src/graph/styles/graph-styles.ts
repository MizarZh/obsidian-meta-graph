export interface GraphPalette {
	node: string;
	selected: string;
	edge: string;
	mutedNode: string;
	mutedEdge: string;
	label: string;
	labelBackground: string;
	background?: string;
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
		mutedNode: read('--background-modifier-border', '#555555'),
		mutedEdge: read('--background-modifier-border', '#555555'),
		label: read('--text-normal', '#000'),
		labelBackground: withAlpha(
			read('--background-primary', '#202020'),
			0.82,
		),
		background: read('--background-primary', '#202020'),
	};
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

export function withAlpha(color: string, alpha: number): string {
	const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/iu);
	if (hex) {
		const value = hex[1] ?? '';
		const expanded =
			value.length === 3
				? value
						.split('')
						.map((channel) => `${channel}${channel}`)
						.join('')
				: value;
		const r = Number.parseInt(expanded.slice(0, 2), 16);
		const g = Number.parseInt(expanded.slice(2, 4), 16);
		const b = Number.parseInt(expanded.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	const channels = color.match(/[\d.]+/gu);
	if (!channels || channels.length < 3) {
		return `rgba(32, 32, 32, ${alpha})`;
	}
	return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
