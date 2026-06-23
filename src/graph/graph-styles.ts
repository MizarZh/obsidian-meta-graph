export interface GraphPalette {
	node: string;
	selected: string;
	edge: string;
	mutedNode: string;
	mutedEdge: string;
	label: string;
	labelBackground: string;
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
		node: read("--interactive-accent", "#7c6ff0"),
		selected: read("--color-orange", "#e08b36"),
		edge: read("--text-muted", "#888888"),
		mutedNode: read("--background-modifier-border", "#555555"),
		mutedEdge: read("--background-modifier-border", "#555555"),
		label: read("--text-normal", "#000"),
		labelBackground: withAlpha(
			read("--background-primary", "#202020"),
			0.82,
		),
	};
}

function normalizeCssColor(
	container: HTMLElement,
	color: string,
	fallback: string,
): string {
	const probe = container.createSpan({
		cls: "knowledge-workspace-color-probe",
		attr: { "aria-hidden": "true" },
	});
	probe.style.color = color;
	const normalized = getComputedStyle(probe).color;
	probe.remove();
	return normalized || fallback;
}

function withAlpha(color: string, alpha: number): string {
	const channels = color.match(/[\d.]+/gu);
	if (!channels || channels.length < 3) {
		return `rgba(32, 32, 32, ${alpha})`;
	}
	return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
