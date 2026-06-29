export interface GraphConnectionDropTarget {
	notePath?: string;
	templateId?: string;
	curated: boolean;
}

export type GraphConnectionDropAction =
	| { kind: 'none' }
	| { kind: 'add-curated'; sourceNodeId: string }
	| {
			kind: 'create-from-template';
			sourceNodeId: string;
			templateId: string;
	  }
	| { kind: 'connect-note'; sourceNodeId: string; notePath: string };

export function resolveGraphConnectionDropAction(
	sourceNodeId: string,
	hoveredTarget: GraphConnectionDropTarget,
	releaseTarget: GraphConnectionDropTarget,
): GraphConnectionDropAction {
	if (releaseTarget.curated) {
		return { kind: 'add-curated', sourceNodeId };
	}

	const templateId = hoveredTarget.templateId ?? releaseTarget.templateId;
	if (templateId) {
		return {
			kind: 'create-from-template',
			sourceNodeId,
			templateId,
		};
	}

	const notePath = hoveredTarget.notePath ?? releaseTarget.notePath;
	if (!notePath || notePath === sourceNodeId) {
		return { kind: 'none' };
	}

	return {
		kind: 'connect-note',
		sourceNodeId,
		notePath,
	};
}
