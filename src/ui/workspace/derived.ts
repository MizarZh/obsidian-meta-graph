import type {
	DebugSnapshot,
	KnowledgeNode,
	WorkspaceState,
} from '../../core/types';
import {
	getActiveDefaultNodeStyle,
	getActiveNodeStyleRules,
} from '../../graph/styles/active-styles';
import { resolveNodeStyle } from '../../graph/styles/style-rules';

type DockNotes = WorkspaceState['dock']['notes'];
type SnapshotNodeIndex = { index: Pick<DebugSnapshot['index'], 'nodes'> };

export interface DockNoteEntry {
	id: string;
	path: string;
	title: string;
	broken: boolean;
	color?: string;
}

export function getSelectedDockNodes(
	snapshot: SnapshotNodeIndex,
	dockNotes: DockNotes,
): KnowledgeNode[] {
	const nodesByPath = new Map(
		snapshot.index.nodes.map((node) => [node.path, node]),
	);
	return dockNotes
		.map((note) => nodesByPath.get(note.path))
		.filter((node): node is KnowledgeNode => node !== undefined);
}

export function getDockNoteCandidates(
	snapshot: SnapshotNodeIndex,
	dockNotes: DockNotes,
	workspaceFilePath?: string,
): KnowledgeNode[] {
	const selectedPaths = new Set(dockNotes.map((note) => note.path));
	return snapshot.index.nodes
		.filter(
			(node) =>
				node.path !== workspaceFilePath &&
				!selectedPaths.has(node.path),
		)
		.sort((first, second) =>
			first.title.localeCompare(second.title, undefined, {
				sensitivity: 'base',
			}),
		);
}

export function getFilePathSuggestions(snapshot: SnapshotNodeIndex): string[] {
	return snapshot.index.nodes
		.map((node) => node.path)
		.sort((first, second) =>
			first.localeCompare(second, undefined, { sensitivity: 'base' }),
		);
}

export function getDockNoteEntries(
	snapshot: SnapshotNodeIndex,
	dockNotes: DockNotes,
	nodeColors: ReadonlyMap<string, string>,
): DockNoteEntry[] {
	const nodesByPath = new Map(
		snapshot.index.nodes.map((node) => [node.path, node]),
	);
	return dockNotes.map((note) => {
		const node = nodesByPath.get(note.path);
		if (node) {
			return {
				id: node.id,
				path: node.path,
				title: node.title,
				broken: false,
				color: nodeColors.get(node.path),
			};
		}

		return {
			id: note.id,
			path: note.path,
			title: getFallbackDockNoteTitle(note.path),
			broken: true,
		};
	});
}

export function getWorkspaceNodeColors(
	nodes: Iterable<KnowledgeNode>,
	state: WorkspaceState,
	defaultColor: string,
): Map<string, string> {
	const colors = new Map<string, string>();
	for (const node of nodes) {
		if (!colors.has(node.path)) {
			colors.set(
				node.path,
				getWorkspaceNodeColor(node, state, defaultColor),
			);
		}
	}
	return colors;
}

export function getWorkspaceNodeColor(
	node: KnowledgeNode,
	state: WorkspaceState,
	defaultColor: string,
): string {
	const rules = getActiveNodeStyleRules(state);
	const defaultNodeStyle = getActiveDefaultNodeStyle(state, defaultColor);
	return resolveNodeStyle(node, rules, defaultNodeStyle).color;
}

export function findDockTemplateLabel(
	templates: WorkspaceState['dock']['templates'],
	templateId: string,
): string | undefined {
	return templates.find((template) => template.id === templateId)?.label;
}

export function findIndexedNodeTitle(
	snapshot: SnapshotNodeIndex,
	nodeId: string,
): string {
	return (
		snapshot.index.nodes.find((node) => node.id === nodeId)?.title ?? nodeId
	);
}

function getFallbackDockNoteTitle(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/u, '') ?? path;
}
