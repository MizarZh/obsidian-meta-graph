import { normalizePath } from '../../core/knowledge-index';
import type { CuratedWorkspaceConfig } from '../../core/types';
import { normalizeCuratedWorkspace } from '../meta-graph-model';

export interface CuratedPathUpdate {
	curated: CuratedWorkspaceConfig;
	changed: boolean;
}

export function addCuratedFilePaths(
	curated: CuratedWorkspaceConfig,
	paths: string[],
): CuratedPathUpdate {
	const normalizedPaths = paths
		.map((path) => normalizePath(path))
		.filter(Boolean);
	if (normalizedPaths.length === 0) {
		return { curated, changed: false };
	}
	const next = normalizeCuratedWorkspace({
		...curated,
		files: [...curated.files, ...normalizedPaths.map((path) => ({ path }))],
	});
	return {
		curated: next,
		changed: next.files.length !== curated.files.length,
	};
}

export function removeCuratedFilePaths(
	curated: CuratedWorkspaceConfig,
	paths: string[],
): CuratedPathUpdate {
	const normalizedPaths = new Set(paths.map((path) => normalizePath(path)));
	const files = curated.files.filter(
		(file) => !normalizedPaths.has(file.path),
	);
	if (files.length === curated.files.length) {
		return { curated, changed: false };
	}
	return {
		curated: normalizeCuratedWorkspace({ ...curated, files }),
		changed: true,
	};
}

export function renameCuratedFilePath(
	curated: CuratedWorkspaceConfig,
	oldPath: string,
	newPath: string,
): CuratedPathUpdate {
	const normalizedOld = normalizePath(oldPath);
	const normalizedNew = normalizePath(newPath);
	if (normalizedOld === normalizedNew) {
		return { curated, changed: false };
	}
	let changed = false;
	const files = curated.files.map((file) => {
		if (file.path !== normalizedOld) {
			return file;
		}
		changed = true;
		return { ...file, path: normalizedNew };
	});
	return {
		curated: changed
			? normalizeCuratedWorkspace({ ...curated, files })
			: curated,
		changed,
	};
}
