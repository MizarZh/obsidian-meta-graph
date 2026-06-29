import type { DebugSnapshot, KnowledgeNode, WorkspaceState } from '../../core/types';

type DockNotes = WorkspaceState['dock']['notes'];
type SnapshotNodeIndex = { index: Pick<DebugSnapshot['index'], 'nodes'> };

export function getSelectedDockNodes(
	snapshot: SnapshotNodeIndex,
	dockNotes: DockNotes,
): KnowledgeNode[] {
	const nodesByPath = new Map(snapshot.index.nodes.map((node) => [node.path, node]));
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
				node.path !== workspaceFilePath && !selectedPaths.has(node.path),
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
