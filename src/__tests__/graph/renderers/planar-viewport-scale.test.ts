import Graphology from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import {
	calculateSigmaCompatibleFitZoom,
	denormalizePlanarPosition,
	getPlanarGraphExtent,
	getPlanarLabelVisualScale,
	getPlanarNativeZoomRange,
	getPlanarVisualScale,
	nativeZoomToPlanarLevel,
	normalizePlanarPosition,
	planarLevelToNativeZoom,
	planarZoomToSizeRatio,
} from '@/graph/renderers/planar-viewport-scale';

describe('planar viewport scale', () => {
	it('treats each renderer fit zoom as the shared 100% baseline', () => {
		expect(nativeZoomToPlanarLevel(4, 4)).toBe(100);
		expect(nativeZoomToPlanarLevel(8, 4)).toBe(200);
		expect(nativeZoomToPlanarLevel(1, 4)).toBe(25);
		expect(planarLevelToNativeZoom(200, 4)).toBe(8);
	});

	it('derives native bounds from the fit zoom', () => {
		expect(getPlanarNativeZoomRange(4)).toEqual([1, 16]);
		expect(planarLevelToNativeZoom(5, 4)).toBe(1);
		expect(planarLevelToNativeZoom(500, 4)).toBe(16);
	});

	it('uses the same linear physical-size scaling in Sigma and G6', () => {
		expect(getPlanarVisualScale(25)).toBe(0.25);
		expect(getPlanarVisualScale(100)).toBe(1);
		expect(getPlanarVisualScale(400)).toBe(4);
		expect(planarZoomToSizeRatio(4)).toBe(4);
		expect(planarZoomToSizeRatio(1)).toBe(1);
		expect(planarZoomToSizeRatio(0.25)).toBe(0.25);
	});

	it('uses a gentler shared readability curve for zoomed labels', () => {
		expect(getPlanarLabelVisualScale(25)).toBe(0.5);
		expect(getPlanarLabelVisualScale(100)).toBe(1);
		expect(getPlanarLabelVisualScale(400)).toBe(2);
	});

	it('matches Sigma coordinate fitting across graph and viewport aspects', () => {
		const square = getPlanarGraphExtent(
			createGraph([
				[0, 0],
				[100, 100],
			]),
		);
		const wide = getPlanarGraphExtent(
			createGraph([
				[0, 0],
				[200, 100],
			]),
		);
		const tall = getPlanarGraphExtent(
			createGraph([
				[0, 0],
				[100, 200],
			]),
		);

		expect(
			calculateSigmaCompatibleFitZoom(square, {
				width: 800,
				height: 600,
			}),
		).toBe(5.4);
		expect(
			calculateSigmaCompatibleFitZoom(wide, { width: 800, height: 600 }),
		).toBe(3.6);
		expect(
			calculateSigmaCompatibleFitZoom(tall, { width: 800, height: 600 }),
		).toBe(2.7);
	});

	it('preserves Sigma-normalized camera centers across extent changes', () => {
		const extent = getPlanarGraphExtent(
			createGraph([
				[10, 20],
				[110, 70],
			]),
		);
		const normalized = normalizePlanarPosition({ x: 85, y: 55 }, extent);

		expect(normalized).toEqual({ x: 0.75, y: 0.6 });
		expect(denormalizePlanarPosition(normalized, extent)).toEqual({
			x: 85,
			y: 55,
		});
	});
});

function createGraph(positions: Array<[number, number]>): RuntimeGraph {
	const graph = new Graphology<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
	positions.forEach(([x, y], index) => {
		graph.addNode(String(index), {
			label: String(index),
			x,
			y,
			size: 1,
			color: '#000000',
			path: `${index}.md`,
			folder: '',
			domains: [],
			tags: [],
		});
	});
	return graph;
}
