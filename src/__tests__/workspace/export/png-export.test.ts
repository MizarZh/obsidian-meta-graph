import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { pngFilename, savePng } from '@/workspace/export/export-file';
import {
	exportDimensions,
	snapshotPlanarPositions,
} from '@/graph/renderers/renderer-export';
import Graph from 'graphology';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { resolveThreeLabelStyle } from '@/graph/renderers/renderer-label-style';
import type { GraphPalette } from '@/graph/styles/graph-styles';

describe('PNG export safety', () => {
	it.each(['rgb(255, 255, 255)', 'rgb(32, 32, 32)'])(
		'preserves source label colors and background opacity on transparent export surfaces: %s',
		(background) => {
			const palette: GraphPalette = {
				background,
				node: '#888',
				selected: '#f00',
				edge: '#888',
				mutedNode: '#888',
				mutedEdge: '#888',
				label: '#000',
				labelBackground: '#fff',
			};
			for (const opacity of [0, 0.4, 1]) {
				const theme = {
					labelLightTextColor: '#123456',
					labelLightBackgroundColor: '#eeeeee',
					labelLightBackgroundOpacity: opacity,
					labelDarkTextColor: '#ffffff',
					labelDarkBackgroundColor: '#222222',
					labelDarkBackgroundOpacity: 0.8,
				};
				expect(
					resolveThreeLabelStyle(
						{
							...palette,
							background: 'transparent',
							labelThemeBackground: background,
						},
						theme,
					),
				).toEqual(resolveThreeLabelStyle(palette, theme));
			}
		},
	);
	it('reads only real visible renderer nodes and preserves the live graph and route bends', () => {
		const live: RuntimeGraph = new Graph();
		const node = {
			x: 1,
			y: 2,
			label: 'Note',
			size: 5,
			color: '#123456',
			path: 'note.md',
			folder: '',
			tags: [],
			domains: [],
		};
		live.addNode('note', node);
		live.addNode('bend', { ...node, x: 5, y: 6, isBend: true });
		live.addNode('hidden', { ...node, x: 7, y: 8, hidden: true });
		const snapshot = live.copy();
		const read = vi.fn((id: string) => {
			if (id !== 'note') throw new Error('Unknown element');
			return { x: 10, y: 20 };
		});
		snapshotPlanarPositions(snapshot, read);
		expect(read).toHaveBeenCalledTimes(1);
		expect(snapshot.getNodeAttributes('note')).toMatchObject({
			x: 10,
			y: 20,
		});
		expect(snapshot.getNodeAttributes('bend')).toMatchObject({
			x: 5,
			y: 6,
		});
		expect(live.getNodeAttributes('note')).toMatchObject({ x: 1, y: 2 });
	});
	it('confines names to one vault file and preserves Unicode names', () => {
		expect(pngFilename('../folder/知识图.PNG')).toBe('-folder-知识图.png');
		expect(pngFilename('...')).toBe('Graph.png');
		expect(pngFilename('知识图.png')).toBe('知识图.png');
	});
	it('rejects oversized or invalid backing stores before allocation', () => {
		expect(exportDimensions(800, 600, 3)).toEqual({
			width: 2400,
			height: 1800,
		});
		for (const [w, h, s] of [
			[0, 600, 2],
			[NaN, 600, 2],
			[800, 600, 4],
			[5000, 5000, 1],
			[9000, 10, 1],
		]) {
			expect(() => exportDimensions(w!, h!, s!)).toThrow();
		}
	});
	it('never overwrites existing files and retries a concurrent name collision', async () => {
		const files = new Set(['Graph.png']);
		const createBinary = vi.fn(async (path: string) => {
			if (path === 'Graph (1).png') {
				files.add(path);
				throw new Error('File exists');
			}
			files.add(path);
		});
		const app = {
			vault: {
				getAbstractFileByPath: (p: string) => files.has(p),
				createBinary,
			},
		} as unknown as App;
		expect(
			await savePng(app, 'Graph', new Blob(['png']), () => false),
		).toBe('Graph (2).png');
		expect(createBinary.mock.calls.map(([path]) => path)).toEqual([
			'Graph (1).png',
			'Graph (2).png',
		]);
	});
	it('checks cancellation after PNG byte conversion and propagates write errors', async () => {
		let cancelled = false;
		const blob = {
			arrayBuffer: async () => {
				cancelled = true;
				return new ArrayBuffer(0);
			},
		} as Blob;
		const createBinary = vi.fn().mockRejectedValue(new Error('Disk full'));
		const app = {
			vault: { getAbstractFileByPath: () => null, createBinary },
		} as unknown as App;
		await expect(
			savePng(app, 'Graph', blob, () => cancelled),
		).rejects.toThrow('Export cancelled');
		expect(createBinary).not.toHaveBeenCalled();
		await expect(
			savePng(app, 'Graph', new Blob(), () => false),
		).rejects.toThrow('Disk full');
	});
});
