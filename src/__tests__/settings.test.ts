import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	normalizeLargeVaultMode,
	normalizeNodeOpenMode,
} from '../settings/settings';

describe('plugin settings', () => {
	it('defaults node opening to a new tab', () => {
		expect(DEFAULT_SETTINGS.nodeOpenMode).toBe('tab');
		expect(DEFAULT_SETTINGS.openTemplateNoteInNewTab).toBe(false);
		expect(DEFAULT_SETTINGS.detailsNoteContentExpanded).toBe(false);
		expect(DEFAULT_SETTINGS.largeVaultMode).toBe('auto');
	});

	it('normalizes persisted node open modes', () => {
		expect(normalizeNodeOpenMode('right-split')).toBe('right-split');
		expect(normalizeNodeOpenMode('internal-preview')).toBe('tab');
		expect(normalizeNodeOpenMode('invalid')).toBe('tab');
	});

	it('normalizes persisted Large Vault modes', () => {
		expect(normalizeLargeVaultMode('on')).toBe('on');
		expect(normalizeLargeVaultMode('off')).toBe('off');
		expect(normalizeLargeVaultMode('invalid')).toBe('auto');
	});
});
