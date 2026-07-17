import type {
	ConnectionFieldMode,
	ConnectionFieldSpec,
	WorkspaceState,
} from '../../core/types';
import {
	DEFAULT_CONNECTION_FIELD_MODE,
	createConnectionFieldSpec,
	normalizeConnectionFieldModes,
	normalizeConnectionFields,
	normalizeConnectionFieldSpecs,
} from '../meta-graph-model';
import { moveRelative, type ReorderPlacement } from './dock-state';

export interface ConnectionFieldStateResult {
	state: WorkspaceState;
	runQuery: boolean;
}

export function addConnectionFieldToState(
	state: WorkspaceState,
	field: string,
	mode: ConnectionFieldMode,
): { state: WorkspaceState; normalized?: string } {
	const normalized = field.trim();
	if (!normalized) {
		return { state };
	}
	const connectionFieldSpecs = normalizeConnectionFieldSpecs([
		...state.connectionFieldSpecs,
		createConnectionFieldSpec(normalized, mode),
	]);
	const activeSpec =
		findConnectionFieldSpec(connectionFieldSpecs, normalized, mode) ??
		connectionFieldSpecs[0];
	const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
	return {
		state: {
			...state,
			connectionFields,
			connectionFieldSpecs,
			connectionFieldModes: normalizeConnectionFieldModes(
				state.connectionFieldModes,
				connectionFields,
			),
			activeConnectionFieldSpecId: activeSpec?.id ?? '',
		},
		normalized,
	};
}

export function addConnectionFieldAndSelectInState(
	state: WorkspaceState,
	field: string,
	mode: ConnectionFieldMode,
): ConnectionFieldStateResult {
	const update = addConnectionFieldToState(state, field, mode);
	return update.normalized
		? setActiveConnectionFieldInState(update.state, update.normalized)
		: { state, runQuery: false };
}

export function removeConnectionFieldFromState(
	state: WorkspaceState,
	id: string,
): WorkspaceState {
	const spec = state.connectionFieldSpecs.find((item) => item.id === id);
	return spec
		? removeConnectionFieldSpec(state, spec.id)
		: removeConnectionFieldByName(state, id);
}

export function reorderConnectionFieldInState(
	state: WorkspaceState,
	id: string,
	targetId: string,
	placement: ReorderPlacement,
): WorkspaceState {
	const connectionFieldSpecs = moveRelative(
		state.connectionFieldSpecs,
		(spec) => spec.id === id,
		(spec) => spec.id === targetId,
		placement,
	);
	if (connectionFieldSpecs === state.connectionFieldSpecs) {
		return state;
	}
	return {
		...state,
		connectionFieldSpecs,
		connectionFields: getConnectionSpecFields(connectionFieldSpecs),
	};
}

export function setConnectionFieldModeInState(
	state: WorkspaceState,
	field: string,
	mode: ConnectionFieldMode,
): WorkspaceState {
	const normalized = field.trim();
	if (!normalized) {
		return state;
	}
	const connectionFieldSpecs = normalizeConnectionFieldSpecs([
		...state.connectionFieldSpecs,
		createConnectionFieldSpec(normalized, mode),
	]);
	const activeSpec =
		findConnectionFieldSpec(connectionFieldSpecs, normalized, mode) ??
		connectionFieldSpecs[0];
	const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
	return {
		...state,
		connectionFields,
		connectionFieldSpecs,
		connectionFieldModes: normalizeConnectionFieldModes(
			{
				...state.connectionFieldModes,
				[normalized]: mode,
			},
			connectionFields,
		),
		activeConnectionFieldSpecId: activeSpec?.id ?? '',
		activeConnectionField: activeSpec?.field ?? normalized,
	};
}

export function setActiveConnectionFieldInState(
	state: WorkspaceState,
	field: string,
): ConnectionFieldStateResult {
	const normalized = field.trim();
	if (!normalized) {
		return { state, runQuery: false };
	}
	const activeMode = getActiveConnectionModeInState(state);
	const activeSpec =
		findConnectionFieldSpec(
			state.connectionFieldSpecs,
			normalized,
			activeMode,
		) ??
		state.connectionFieldSpecs.find((item) => item.field === normalized);
	return {
		state: {
			...state,
			activeConnectionFieldSpecId:
				activeSpec?.id ?? state.activeConnectionFieldSpecId,
			activeConnectionField: normalized,
		},
		runQuery: false,
	};
}

export function getConnectionSpecFields(
	specs: ConnectionFieldSpec[],
): string[] {
	return normalizeConnectionFields(specs.map((spec) => spec.field));
}

export function findConnectionFieldSpec(
	specs: ConnectionFieldSpec[],
	field: string,
	mode: ConnectionFieldMode,
): ConnectionFieldSpec | undefined {
	return specs.find((spec) => spec.field === field && spec.mode === mode);
}

export function getActiveConnectionModeInState(
	state: WorkspaceState,
): ConnectionFieldMode {
	return (
		getActiveConnectionSpec(state)?.mode ?? DEFAULT_CONNECTION_FIELD_MODE
	);
}

export function getConnectionModeForFieldInState(
	state: WorkspaceState,
	field: string,
): ConnectionFieldMode {
	const activeSpec = getActiveConnectionSpec(state);
	if (activeSpec?.field === field) {
		return activeSpec.mode;
	}
	return DEFAULT_CONNECTION_FIELD_MODE;
}

function removeConnectionFieldSpec(
	state: WorkspaceState,
	id: string,
): WorkspaceState {
	const connectionFieldSpecs = normalizeConnectionFieldSpecs(
		state.connectionFieldSpecs.filter((item) => item.id !== id),
	);
	const activeSpec =
		state.activeConnectionFieldSpecId === id
			? connectionFieldSpecs[0]
			: getActiveConnectionSpec(state, connectionFieldSpecs);
	const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
	return {
		...state,
		connectionFields,
		connectionFieldSpecs,
		connectionFieldModes: normalizeConnectionFieldModes(
			state.connectionFieldModes,
			connectionFields,
		),
		activeConnectionFieldSpecId: activeSpec?.id ?? '',
		activeConnectionField: activeSpec?.field ?? '',
	};
}

function removeConnectionFieldByName(
	state: WorkspaceState,
	field: string,
): WorkspaceState {
	const normalized = field.trim();
	if (!normalized) {
		return state;
	}
	const connectionFieldSpecs = normalizeConnectionFieldSpecs(
		state.connectionFieldSpecs.filter((item) => item.field !== normalized),
	);
	const activeSpec =
		state.activeConnectionField === normalized
			? connectionFieldSpecs[0]
			: getActiveConnectionSpec(state, connectionFieldSpecs);
	const connectionFields = getConnectionSpecFields(connectionFieldSpecs);
	return {
		...state,
		connectionFields,
		connectionFieldSpecs,
		connectionFieldModes: normalizeConnectionFieldModes(
			state.connectionFieldModes,
			connectionFields,
		),
		activeConnectionFieldSpecId: activeSpec?.id ?? '',
		activeConnectionField: activeSpec?.field ?? '',
	};
}

function getActiveConnectionSpec(
	state: WorkspaceState,
	specs = state.connectionFieldSpecs,
): ConnectionFieldSpec | undefined {
	return (
		specs.find((item) => item.id === state.activeConnectionFieldSpecId) ??
		specs.find((item) => item.field === state.activeConnectionField) ??
		specs[0]
	);
}
