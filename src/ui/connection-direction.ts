import type { IconName } from 'obsidian';
import type { ConnectionFieldMode } from '../core/types';

export function getConnectionDirectionIcon(
	mode: ConnectionFieldMode,
): IconName {
	if (mode === 'bidirectional' || mode === 'paired') {
		return 'arrow-left-right';
	}
	return mode === 'reverse' ? 'undo-2' : 'arrow-right';
}

export function getConnectionDirectionLabel(mode: ConnectionFieldMode): string {
	if (mode === 'bidirectional') {
		return 'Two-way';
	}
	if (mode === 'paired') {
		return 'Paired';
	}
	return mode === 'reverse' ? 'Reverse' : 'One-way';
}
