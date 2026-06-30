import { describe, expect, it } from 'vitest';
import {
	WorkspaceConnectionService,
	type WorkspaceConnectionAdapter,
} from '../workspace/services/connection-service';

interface TestFile {
	path: string;
}

describe('workspace connection service', () => {
	it('writes directed links and removes newly created fields on undo', async () => {
		const { service, frontmatter } = createConnectionService([
			'Source.md',
			'Target.md',
		]);

		await expect(
			service.connectNodes('Source.md', 'Target.md', 'leads-to', 'directed'),
		).resolves.toBe(true);

		expect(frontmatter('Source.md')).toEqual({
			'leads-to': ['[[Target]]'],
		});
		expect(service.undoCount).toBe(1);

		await expect(service.undoLastConnection()).resolves.toBe(true);

		expect(frontmatter('Source.md')).toEqual({});
		expect(service.undoCount).toBe(0);
	});

	it('restores previous scalar field shape on undo', async () => {
		const { service, frontmatter } = createConnectionService(
			['Source.md', 'Existing.md', 'Target.md'],
			{
				'Source.md': {
					'leads-to': '[[Existing]]',
				},
			},
		);

		await service.connectNodes('Source.md', 'Target.md', 'leads-to', 'directed');

		expect(frontmatter('Source.md')).toEqual({
			'leads-to': ['[[Existing]]', '[[Target]]'],
		});

		await service.undoLastConnection();

		expect(frontmatter('Source.md')).toEqual({
			'leads-to': '[[Existing]]',
		});
	});

	it('skips duplicate links resolved through existing aliases', async () => {
		const { service, frontmatter } = createConnectionService(
			['Source.md', 'Target.md'],
			{
				'Source.md': {
					'leads-to': ['[[Target|Alias]]'],
				},
			},
		);

		await expect(
			service.connectNodes('Source.md', 'Target.md', 'leads-to', 'directed'),
		).resolves.toBe(false);

		expect(frontmatter('Source.md')).toEqual({
			'leads-to': ['[[Target|Alias]]'],
		});
		expect(service.undoCount).toBe(0);
	});

	it('writes and undoes bidirectional links as one undo entry', async () => {
		const { service, frontmatter } = createConnectionService([
			'Source.md',
			'Target.md',
		]);

		await service.connectNodes(
			'Source.md',
			'Target.md',
			'related',
			'bidirectional',
		);

		expect(frontmatter('Source.md')).toEqual({
			related: ['[[Target]]'],
		});
		expect(frontmatter('Target.md')).toEqual({
			related: ['[[Source]]'],
		});
		expect(service.undoCount).toBe(1);

		await service.undoLastConnection();

		expect(frontmatter('Source.md')).toEqual({});
		expect(frontmatter('Target.md')).toEqual({});
	});

	it('writes reverse links onto the target note', async () => {
		const { service, frontmatter } = createConnectionService([
			'Source.md',
			'Target.md',
		]);

		await service.connectNodes('Source.md', 'Target.md', 'requires', 'reverse');

		expect(frontmatter('Source.md')).toEqual({});
		expect(frontmatter('Target.md')).toEqual({
			requires: ['[[Source]]'],
		});
	});

	it('maps dock-to-graph direction before writing metadata', async () => {
		const { service, frontmatter } = createConnectionService([
			'Dock.md',
			'Graph.md',
		]);

		await service.connectDockNote(
			'Dock.md',
			'Graph.md',
			'from-dock-to-graph',
			'leads-to',
			'directed',
		);

		expect(frontmatter('Dock.md')).toEqual({
			'leads-to': ['[[Graph]]'],
		});
	});
});

function createConnectionService(
	paths: string[],
	initialFrontmatter: Record<string, Record<string, unknown>> = {},
): {
	service: WorkspaceConnectionService<TestFile>;
	frontmatter: (path: string) => Record<string, unknown>;
} {
	const files = new Map(paths.map((path) => [path, { path }]));
	const frontmatterByPath = new Map(
		paths.map((path) => [path, { ...(initialFrontmatter[path] ?? {}) }]),
	);
	const adapter: WorkspaceConnectionAdapter<TestFile> = {
		getFile: (path) => files.get(path) ?? null,
		isFile: (value): value is TestFile =>
			Boolean(value) &&
			typeof value === 'object' &&
			typeof (value as TestFile).path === 'string',
		getPath: (file) => file.path,
		generateMarkdownLink: (targetFile) =>
			`[[${targetFile.path.replace(/\.md$/u, '')}]]`,
		processFrontMatter: async (file, callback) => {
			const frontmatter = frontmatterByPath.get(file.path);
			if (frontmatter) {
				callback(frontmatter);
			}
		},
		resolveLink: (linkText) => {
			const exact = files.get(linkText);
			return exact ?? files.get(`${linkText}.md`) ?? null;
		},
	};
	return {
		service: new WorkspaceConnectionService(adapter),
		frontmatter: (path) => frontmatterByPath.get(path) ?? {},
	};
}
