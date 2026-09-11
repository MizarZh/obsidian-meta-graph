import { describe, expect, it } from 'vitest';
import {
	timelineCurrent,
	applyTimeline,
	indexTimeline,
	nextTimelinePlaybackEnd,
	normalizeTimeline,
	timelineConfigKey,
} from '@/graph/timeline';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

describe('timeline playback', () => {
	it('keeps From/To fixed while the independent cursor advances and stops at To', () => {
		const index = {
			min: 100,
			max: 500,
			times: new Map([
				['a', 100],
				['b', 200],
				['c', 500],
			]),
			undated: 0,
		};
		const config = normalizeTimeline({
			enabled: true,
			start: 100,
			end: 300,
			current: 150,
		});
		expect(timelineCurrent(config, index)).toBe(150);
		const next = {
			...config,
			current: nextTimelinePlaybackEnd(150, 'day', index, 300),
		};
		expect(next).toMatchObject({ start: 100, end: 300, current: 300 });
		expect(timelineCurrent({ ...config, current: 900 }, index)).toBe(300);
		expect(timelineCurrent({ ...config, current: 0 }, index)).toBe(100);
	});

	it('reveals later nodes on consecutive ticks despite year-long gaps', () => {
		const dates = ['2020-01-01', '2024-01-01', '2026-01-01'].map(
			Date.parse,
		);
		const state = createWorkspaceState(200);
		state.projection = {
			nodes: dates.map((createdTime, i) => ({
				id: String(i),
				path: String(i),
				title: String(i),
				folder: '',
				tags: [],
				domains: [],
				createdTime,
			})),
			edges: [],
			rootIds: new Set(),
		};
		const index = indexTimeline(state.projection.nodes, 'created');
		let config = normalizeTimeline({
			enabled: true,
			start: dates[0],
			end: dates[0],
		});
		for (let i = 0; i < dates.length; i++) {
			const view = applyTimeline(state, config);
			expect(
				view.projection!.nodes.filter(
					(node) => !view.projection!.hiddenNodeIds?.has(node.id),
				),
			).toHaveLength(i + 1);
			config = {
				...config,
				end: nextTimelinePlaybackEnd(config.end!, config.step, index),
			};
		}
		expect(config.end).toBe(index.max);
	});
	it('preserves the selected calendar step when it contains nodes', () => {
		const time = new Date(2025, 0, 1).getTime();
		const index = {
			min: time,
			max: time + 10 * 86400000,
			times: new Map([
				['a', time],
				['b', time + 1000],
				['c', time + 10 * 86400000],
			]),
			undated: 0,
		};
		expect(nextTimelinePlaybackEnd(time, 'day', index)).toBe(
			new Date(2025, 0, 2).getTime(),
		);
		expect(nextTimelinePlaybackEnd(index.max, 'day', index)).toBe(
			index.max,
		);
	});
	it('treats cloned settings as unchanged while detecting real edits', () => {
		const config = normalizeTimeline({ enabled: true });
		expect(timelineConfigKey({ ...config })).toBe(
			timelineConfigKey(config),
		);
		expect(timelineConfigKey({ ...config, end: 100 })).not.toBe(
			timelineConfigKey(config),
		);
	});
});
