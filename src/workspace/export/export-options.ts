import type { PngExportOptions } from '@/graph/renderers/renderer-export';

export type ExportFormat = 'png' | 'svg' | 'json' | 'csv' | 'md';
export interface ChartExportOptions extends PngExportOptions {
	format: ExportFormat;
	entries: 'both' | 'nodes' | 'edges';
	entryScope: 'chart' | 'selection';
	includeMetadata: boolean;
}

export function isEntryFormat(format: ExportFormat): boolean {
	return format === 'json' || format === 'csv' || format === 'md';
}
