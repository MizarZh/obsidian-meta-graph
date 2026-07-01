import type {
	ChartLayoutConfig,
	ChartSource,
	CuratedWorkspaceConfig,
	CuratedWorkspaceFile,
	ManualLayoutConfig,
	MetaGraphChart,
	NodePlacement,
} from '../../core/types';

export function hydrateCuratedManualLayout(
	source: ChartSource,
	curated: CuratedWorkspaceConfig,
	layout: ChartLayoutConfig,
): { curated: CuratedWorkspaceConfig; layout: ChartLayoutConfig } {
	if (source !== 'curated') {
		return { curated, layout };
	}
	const files = curated.files.map(stripCuratedFilePlacement);
	if (!layout.manual) {
		return {
			curated: { ...curated, files },
			layout,
		};
	}
	const placements = readCuratedFilePlacements(curated.files);
	return {
		curated: { ...curated, files },
		layout: {
			...layout,
			manual: {
				...layout.manual,
				nodes: {
					...placements,
					...layout.manual.nodes,
				},
			},
		},
	};
}

export function serializeChartForDocument(
	chart: MetaGraphChart,
): MetaGraphChart {
	const layout = roundChartLayout(chart.layout);
	if (chart.source !== 'curated') {
		return {
			...chart,
			layout,
			curated: stripCuratedPlacements(chart.curated),
		};
	}
	if (!layout.manual) {
		return {
			...chart,
			layout,
			curated: stripCuratedPlacements(chart.curated),
		};
	}
	const manualNodes = layout.manual.nodes;
	const curatedPaths = new Set(chart.curated.files.map((file) => file.path));
	return {
		...chart,
		curated: {
			...chart.curated,
			files: chart.curated.files.map((file) => {
				const placement = manualNodes[file.path];
				const stripped = stripCuratedFilePlacement(file);
				if (!placement) {
					return stripped;
				}
				return {
					...stripped,
					x: placement.x,
					y: placement.y,
					...(placement.groupId
						? { groupId: placement.groupId }
						: {}),
				};
			}),
		},
		layout: {
			...layout,
			manual: {
				...layout.manual,
				nodes: Object.fromEntries(
					Object.entries(manualNodes).filter(
						([path]) => !curatedPaths.has(path),
					),
				),
			},
		},
	};
}

function readCuratedFilePlacements(
	files: CuratedWorkspaceFile[],
): ManualLayoutConfig['nodes'] {
	const nodes: ManualLayoutConfig['nodes'] = {};
	for (const file of files) {
		if (
			typeof file.x !== 'number' ||
			typeof file.y !== 'number' ||
			!Number.isFinite(file.x) ||
			!Number.isFinite(file.y)
		) {
			continue;
		}
		nodes[file.path] = file.groupId
			? { x: file.x, y: file.y, groupId: file.groupId }
			: { x: file.x, y: file.y };
	}
	return nodes;
}

function stripCuratedPlacements(
	curated: CuratedWorkspaceConfig,
): CuratedWorkspaceConfig {
	return {
		...curated,
		files: curated.files.map(stripCuratedFilePlacement),
	};
}

function stripCuratedFilePlacement(
	file: CuratedWorkspaceFile,
): CuratedWorkspaceFile {
	return {
		path: file.path,
		...(file.note ? { note: file.note } : {}),
		...(file.hidden ? { hidden: true } : {}),
	};
}

function roundChartLayout(layout: ChartLayoutConfig): ChartLayoutConfig {
	if (!layout.manual) {
		return layout;
	}
	return {
		...layout,
		manual: {
			nodes: Object.fromEntries(
				Object.entries(layout.manual.nodes).map(([path, placement]) => [
					path,
					roundPlacement(placement),
				]),
			),
			groups: layout.manual.groups.map((group) => ({
				...group,
				x: roundCoordinate(group.x),
				y: roundCoordinate(group.y),
				width: roundCoordinate(group.width),
				height: roundCoordinate(group.height),
				padding: roundCoordinate(group.padding),
			})),
		},
	};
}

function roundPlacement(placement: NodePlacement): NodePlacement {
	return {
		x: roundCoordinate(placement.x),
		y: roundCoordinate(placement.y),
		...(placement.groupId ? { groupId: placement.groupId } : {}),
	};
}

function roundCoordinate(value: number): number {
	const rounded = Math.round(value * 1000) / 1000;
	return Object.is(rounded, -0) ? 0 : rounded;
}
