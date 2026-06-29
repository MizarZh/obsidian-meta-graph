import { describe, expect, it } from 'vitest';
import { resolveGraphConnectionDropAction } from '../ui/graph-connection-drop';

describe('graph connection dock drop planning', () => {
	it('prefers curated target from release target', () => {
		expect(
			resolveGraphConnectionDropAction(
				'A.md',
				{ templateId: 'template', curated: false },
				{ curated: true },
			),
		).toEqual({ kind: 'add-curated', sourceNodeId: 'A.md' });
	});

	it('uses hovered template before release target template', () => {
		expect(
			resolveGraphConnectionDropAction(
				'A.md',
				{ templateId: 'hovered', curated: false },
				{ templateId: 'release', curated: false },
			),
		).toEqual({
			kind: 'create-from-template',
			sourceNodeId: 'A.md',
			templateId: 'hovered',
		});
	});

	it('connects to dock note and ignores self links', () => {
		expect(
			resolveGraphConnectionDropAction(
				'A.md',
				{ curated: false },
				{ notePath: 'B.md', curated: false },
			),
		).toEqual({
			kind: 'connect-note',
			sourceNodeId: 'A.md',
			notePath: 'B.md',
		});

		expect(
			resolveGraphConnectionDropAction(
				'A.md',
				{ notePath: 'A.md', curated: false },
				{ curated: false },
			),
		).toEqual({ kind: 'none' });
	});
});
