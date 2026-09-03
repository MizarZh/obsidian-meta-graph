import { setTooltip } from 'obsidian';

export function obsidianTooltip(
	node: HTMLElement,
	tooltip: string,
): { update: (nextTooltip: string) => void } {
	const applyTooltip = (value: string): void => {
		if (!value.trim()) return;
		setTooltip(node, value, { placement: 'top' });
	};

	applyTooltip(tooltip);
	return { update: applyTooltip };
}
