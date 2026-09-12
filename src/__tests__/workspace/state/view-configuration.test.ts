import { describe, expect, it } from 'vitest';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { updateActiveChartState } from '@/workspace/state/state-updaters';
import { normalizeChart } from '@/workspace/meta-graph/chart';
import {
	captureViewConfiguration,
	parseViewConfiguration,
	applyViewConfigurationInState,
	DEFAULT_CONFIGURATION_SELECTION,
	type ConfigurationSelection,
} from '@/workspace/configuration/view-configuration';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
const styles = DEFAULT_CONFIGURATION_SELECTION;
const all: ConfigurationSelection = {
	styles: true,
	layout: true,
	panels: true,
	groups: true,
};
function fixture() {
	const state = createWorkspaceState(200, 1.5);
	const target = state.charts.find((c) => c.id === state.activeChartId)!;
	target.layout.manual = {
		nodes: { 'target.md': { x: 10, y: 20 } },
		groups: [],
	};
	const source = normalizeChart(
		{
			...target,
			id: 'source',
			name: 'Source',
			style: { ...target.style, nodeOverrides: { color: '#123456' } },
			layout: {
				...target.layout,
				spacing: 2,
				manual: {
					nodes: { 'secret.md': { x: 90, y: 90 } },
					groups: [],
				},
			},
		},
		0,
		200,
		1.5,
	);
	const synced = updateActiveChartState(state, { layout: target.layout });
	return {
		state: synced,
		target: synced.charts.find((c) => c.id === synced.activeChartId)!,
		source,
	};
}
describe('view configuration', () => {
	it('applies styles without changing query, coordinates, globals, identity or layout scheduling', () => {
		const { state, target, source } = fixture();
		const next = applyViewConfigurationInState(
			state,
			captureViewConfiguration(source, styles),
			styles,
			target.id,
		);
		const chart = next.charts.find((c) => c.id === target.id)!;
		expect(chart.style.nodeOverrides.color).toBe('#123456');
		expect(chart.query).toEqual(target.query);
		expect(chart.curated).toEqual(target.curated);
		expect(chart.layout).toEqual(target.layout);
		expect(chart.renderer).toBe(target.renderer);
		expect(chart.name).toBe(target.name);
		expect(next.defaultNodeStyle).toEqual(state.defaultNodeStyle);
		expect(next.globalNodeStyleRules).toEqual(state.globalNodeStyleRules);
		expect(target.style.nodeOverrides.color).not.toBe('#123456');
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({
			shouldRebuild: false,
			forceLayout: false,
			styleRulesChanged: true,
		});
	});
	it('copies compatible layout settings while retaining target coordinates', () => {
		const { state, target, source } = fixture();
		const selection = { ...styles, styles: false, layout: true };
		const config = captureViewConfiguration(source, selection);
		expect(JSON.stringify(config)).not.toContain('secret.md');
		const next = applyViewConfigurationInState(
			state,
			config,
			selection,
			target.id,
		);
		expect(
			next.charts.find((c) => c.id === target.id)!.layout,
		).toMatchObject({ spacing: 2, manual: target.layout.manual });
		expect(next.layoutRevision).toBe(state.layoutRevision + 1);
		expect(() =>
			applyViewConfigurationInState(
				state,
				{ ...config, sourceType: 'arc' },
				selection,
				target.id,
			),
		).toThrow('unavailable');
	});
	it('updates live panel widths and preserves timeline options and dock content', () => {
		const { state, target, source } = fixture();
		source.presentation.dockWidth = 420;
		source.display.showLegend = !target.display.showLegend;
		source.display.timeline.enabled = true;
		const selection = { ...styles, styles: false, panels: true };
		const next = applyViewConfigurationInState(
			state,
			captureViewConfiguration(source, selection),
			selection,
			target.id,
		);
		expect(next.dock.dockWidth).toBe(420);
		expect(next.dock.templates).toEqual(state.dock.templates);
		expect(next.showLegend).toBe(source.display.showLegend);
		expect(next.timeline).toEqual({
			...target.display.timeline,
			enabled: true,
		});
	});
	it('adds groups with unique names and frames, remaps style references and preserves assignments', () => {
		const { state, target, source } = fixture();
		const group = {
			id: 'group',
			name: 'Topic',
			color: '#123456',
			padding: 1,
			mode: 'manual' as const,
		};
		target.grouping = {
			groups: [group],
			overrides: { 'target.md': 'group' },
		};
		source.grouping = {
			groups: [group],
			overrides: { 'secret.md': 'group' },
		};
		source.style.nodeRules = [
			{
				id: 'group-rule',
				field: 'group',
				operator: 'is',
				value: 'group',
				color: '#123456',
				size: 5,
				shape: 'circle',
			},
		];
		const next = applyViewConfigurationInState(
			state,
			captureViewConfiguration(source, all),
			all,
			target.id,
		);
		const chart = next.charts.find((c) => c.id === target.id)!;
		expect(chart.grouping.groups.map((g) => g.name)).toEqual([
			'Topic',
			'Topic (2)',
		]);
		expect(chart.grouping.overrides).toEqual(target.grouping.overrides);
		expect(chart.layout.manual?.nodes).toEqual(target.layout.manual?.nodes);
		expect(chart.layout.manual?.groupFrames?.['group-2']).toBeDefined();
		expect(chart.style.nodeRules[0]?.value).toBe('Topic (2)');
	});
	it('exports workspace defaults as local styles without private node data', () => {
		const { state, source } = fixture();
		state.defaultNodeStyle.color = '#abcdef';
		const config = captureViewConfiguration(source, all, state);
		const restored = parseViewConfiguration(JSON.stringify(config));
		expect(restored.styles?.style.nodeOverrides.color).toBe('#123456');
		expect(restored.styles?.style.nodeOverrides.size).toBe(
			state.defaultNodeStyle.size,
		);
		expect(JSON.stringify(restored)).not.toContain('secret.md');
		expect(restored.layout?.settings).not.toHaveProperty('manual');
		expect(restored).not.toHaveProperty('query');
	});
	it('rejects foreign, malformed, empty and stale-target requests', () => {
		const { state, source, target } = fixture();
		const config = captureViewConfiguration(source, styles);
		for (const raw of [
			{},
			{ ...config, version: 2 },
			{ ...config, styles: [] },
			{ ...config, styles: undefined },
		])
			expect(() => parseViewConfiguration(JSON.stringify(raw))).toThrow();
		expect(() =>
			applyViewConfigurationInState(state, config, styles, 'old-target'),
		).toThrow('target view changed');
		expect(state.charts.find((c) => c.id === target.id)!.name).toBe(
			target.name,
		);
	});
});
