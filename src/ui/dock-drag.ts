import type { DockDragPayload } from './dock-types';

export function getDockDragKey(payload: DockDragPayload): string {
	return payload.kind === 'template'
		? `template:${payload.templateId}`
		: `note:${payload.notePath}`;
}

export function canDockPayloadTargetNode(
	payload: DockDragPayload,
	nodeId: string,
): boolean {
	return payload.kind !== 'note' || payload.notePath !== nodeId;
}
