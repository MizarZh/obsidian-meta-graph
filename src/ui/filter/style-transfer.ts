import type { ChartStyleConfig } from '../../core/types';
import { createRuleId } from './filter-tree';
import { cloneSerializable } from '../../workspace/state/persistence';

const CLIPBOARD_TYPE = 'meta-graph-chart-style';
const CLIPBOARD_VERSION = 1;

let chartStyleClipboard: ChartStyleConfig | undefined;

export async function copyChartStyles(style: ChartStyleConfig): Promise<void> {
	chartStyleClipboard = cloneSerializable(style);
	try {
		if (typeof navigator === 'undefined' || !navigator.clipboard) {
			return;
		}
		await navigator.clipboard.writeText(
			JSON.stringify({
				type: CLIPBOARD_TYPE,
				version: CLIPBOARD_VERSION,
				style: chartStyleClipboard,
			}),
		);
	} catch {
		// In-memory clipboard still supports copying between chart tabs.
	}
}

export async function pasteChartStyles(): Promise<
	ChartStyleConfig | undefined
> {
	try {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			const text = await navigator.clipboard.readText();
			const parsed: unknown = JSON.parse(text);
			if (isClipboardPayload(parsed)) {
				return cloneForPaste(parsed.style);
			}
		}
	} catch {
		// Fall back to in-memory clipboard when system clipboard is unavailable.
	}
	if (chartStyleClipboard) {
		return cloneForPaste(chartStyleClipboard);
	}
	return undefined;
}

function isClipboardPayload(
	value: unknown,
): value is { style: ChartStyleConfig } {
	if (!isRecord(value) || value.type !== CLIPBOARD_TYPE) {
		return false;
	}
	if (value.version !== CLIPBOARD_VERSION || !isRecord(value.style)) {
		return false;
	}
	const style = value.style;
	return (
		isRecord(style.nodeOverrides) &&
		isRecord(style.unresolvedNodeOverrides) &&
		isRecord(style.linkOverrides) &&
		isRecord(style.plainLinkOverrides) &&
		isRecord(style.unresolvedLinkOverrides) &&
		isStyleRuleArray(style.nodeRules) &&
		isStyleRuleArray(style.linkRules)
	);
}

function isStyleRuleArray(value: unknown): value is Record<string, unknown>[] {
	return Array.isArray(value) && value.every(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneForPaste(style: ChartStyleConfig): ChartStyleConfig {
	const cloned = cloneSerializable(style);
	return {
		...cloned,
		nodeRules: cloned.nodeRules.map((rule) => ({
			...rule,
			id: createRuleId(),
		})),
		linkRules: cloned.linkRules.map((rule) => ({
			...rule,
			id: createRuleId(),
		})),
	};
}
