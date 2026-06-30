import type { ChartGroup, ChartLayoutConfig } from '../../../core/types';
import { CUBE_FACE_GROUPS_BY_ID } from './cube-layout';

export function getManualGroup(
	layout: ChartLayoutConfig,
	chartType: string,
	groupId: string,
): ChartGroup | undefined {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	return (
		manual.groups.find((item) => item.id === groupId) ??
		(chartType === 'cube' ? CUBE_FACE_GROUPS_BY_ID.get(groupId) : undefined)
	);
}

export function createUniqueDefaultGroup(
	existingGroups: ChartGroup[],
): ChartGroup {
	const existingIds = new Set(existingGroups.map((group) => group.id));
	let index = existingGroups.length + 1;
	let group = createDefaultGroup(index);
	while (existingIds.has(group.id)) {
		index += 1;
		group = createDefaultGroup(index);
	}
	return group;
}

export function normalizeGroupPatch(
	group: ChartGroup,
	patch: Partial<ChartGroup>,
): ChartGroup {
	return {
		...group,
		...patch,
		name:
			typeof patch.name === 'string' && patch.name.trim()
				? patch.name.trim()
				: group.name,
		width:
			typeof patch.width === 'number' && Number.isFinite(patch.width)
				? Math.max(0.8, patch.width)
				: group.width,
		height:
			typeof patch.height === 'number' && Number.isFinite(patch.height)
				? Math.max(0.6, patch.height)
				: group.height,
		padding:
			typeof patch.padding === 'number' && Number.isFinite(patch.padding)
				? Math.max(0, patch.padding)
				: group.padding,
		mode: patch.mode === 'rule' ? 'rule' : (patch.mode ?? group.mode),
	};
}

function createDefaultGroup(index: number): ChartGroup {
	return {
		id: createGroupId(`Group ${index}`),
		name: `Group ${index}`,
		x: -1.6,
		y: -1.1,
		width: 3.2,
		height: 2.2,
		color: '#7c6ff0',
		mode: 'manual',
		padding: 0.32,
	};
}

function createGroupId(name: string): string {
	const slug = name
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `group-${slug || Date.now().toString(36)}`;
}
