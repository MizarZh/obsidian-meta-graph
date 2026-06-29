import type {
	ConnectionFieldMode,
	ConnectionFieldSpec,
	WorkspaceState,
} from '../core/types';
import {
	createConnectionFieldSpec,
	normalizeConnectionFieldModes,
	normalizeConnectionFields,
	normalizeConnectionFieldSpecs,
} from './meta-graph-model';
import { moveRelative, type ReorderPlacement } from './workspace-dock-state';

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
