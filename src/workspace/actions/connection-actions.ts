import type {
	ConnectionFieldMode,
	DockConnectionDirection,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import {
	getConnectionModeForFieldInState,
	setActiveConnectionFieldInState,
} from '../state/connection-fields';
import {
	normalizeConnectionRequest,
	normalizeDockConnectionRequest,
	type NormalizedConnectionRequest,
} from './connection-request';

export interface WorkspaceConnectionPort {
	readonly undoCount: number;
	connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field: string,
		mode: ConnectionFieldMode,
	): Promise<boolean>;
	undoLastConnection(): Promise<boolean>;
}

export interface PreparedConnectionAction {
	state: WorkspaceState;
	runQuery: boolean;
	request: NormalizedConnectionRequest;
	mode: ConnectionFieldMode;
}

export interface WorkspaceConnectionActionResult {
	state: WorkspaceState;
	changed: boolean;
	refresh: boolean;
	forceLayout: boolean;
}

export function prepareConnectNodesInState(
	state: WorkspaceState,
	sourceNodeId: NodeId,
	targetNodeId: NodeId,
	field: string,
): PreparedConnectionAction | null {
	return prepareConnectionRequestInState(
		state,
		normalizeConnectionRequest(field, sourceNodeId, targetNodeId),
	);
}

export function prepareConnectDockNoteInState(
	state: WorkspaceState,
	notePath: NodeId,
	targetNodeId: NodeId,
	direction: DockConnectionDirection,
	field: string,
): PreparedConnectionAction | null {
	return prepareConnectionRequestInState(
		state,
		normalizeDockConnectionRequest(
			notePath,
			targetNodeId,
			direction,
			field,
		),
	);
}

export async function connectPreparedNodesInState(
	state: WorkspaceState,
	service: WorkspaceConnectionPort,
	action: PreparedConnectionAction,
	relayoutFlowAfterConnection: boolean,
): Promise<WorkspaceConnectionActionResult> {
	const changed = await service.connectNodes(
		action.request.sourceNodeId,
		action.request.targetNodeId,
		action.request.field,
		action.mode,
	);
	return completeConnectionChangeInState(
		state,
		changed,
		service.undoCount,
		relayoutFlowAfterConnection,
	);
}

export async function undoLastConnectionInState(
	state: WorkspaceState,
	service: WorkspaceConnectionPort,
): Promise<WorkspaceConnectionActionResult> {
	const changed = await service.undoLastConnection();
	return {
		state: updateConnectionUndoCountInState(state, service.undoCount),
		changed,
		refresh: changed,
		forceLayout: false,
	};
}

export function completeConnectionChangeInState(
	state: WorkspaceState,
	changed: boolean,
	undoCount: number,
	relayoutFlowAfterConnection: boolean,
): WorkspaceConnectionActionResult {
	if (!changed) {
		return {
			state,
			changed: false,
			refresh: false,
			forceLayout: false,
		};
	}
	return {
		state: updateConnectionUndoCountInState(state, undoCount),
		changed: true,
		refresh: true,
		forceLayout: state.mode === 'flow' && relayoutFlowAfterConnection,
	};
}

function prepareConnectionRequestInState(
	state: WorkspaceState,
	request: NormalizedConnectionRequest | null,
): PreparedConnectionAction | null {
	if (!request) {
		return null;
	}
	const result = setActiveConnectionFieldInState(state, request.field);
	return {
		state: result.state,
		runQuery: result.runQuery,
		request,
		mode: getConnectionModeForFieldInState(result.state, request.field),
	};
}

function updateConnectionUndoCountInState(
	state: WorkspaceState,
	connectionUndoCount: number,
): WorkspaceState {
	return state.connectionUndoCount === connectionUndoCount
		? state
		: { ...state, connectionUndoCount };
}
