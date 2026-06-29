import type { DockConnectionDirection } from '../core/types';
import type { DockDragPayload } from './dock-types';

export type DockPayloadGraphAction =
	| {
			kind: 'create-from-template';
			payload: Extract<DockDragPayload, { kind: 'template' }>;
			targetNodeId: string;
			direction: DockConnectionDirection;
	  }
	| {
			kind: 'connect-note';
			notePath: string;
			targetNodeId: string;
			direction: DockConnectionDirection;
			relationField: string;
	  }
	| { kind: 'none' };

export function resolveDockPayloadGraphAction(
	payload: DockDragPayload,
	targetNodeId: string,
): DockPayloadGraphAction {
	if (payload.kind === 'template') {
		return {
			kind: 'create-from-template',
			payload,
			targetNodeId,
			direction: 'from-dock-to-graph',
		};
	}

	if (payload.kind === 'broken-note') {
		return { kind: 'none' };
	}

	return {
		kind: 'connect-note',
		notePath: payload.notePath,
		targetNodeId,
		direction: payload.direction,
		relationField: payload.relationField,
	};
}
