import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeNodeOpenMode } from '../settings/settings';

describe('plugin settings', () => {
	it('defaults node opening to a new tab', () => {
		expect(DEFAULT_SETTINGS.nodeOpenMode).toBe('tab');
		expect(DEFAULT_SETTINGS.openTemplateNoteInNewTab).toBe(false);
	});

	it('normalizes persisted node open modes', () => {
		expect(normalizeNodeOpenMode('right-split')).toBe('right-split');
		expect(normalizeNodeOpenMode('internal-preview')).toBe('tab');
		expect(normalizeNodeOpenMode('invalid')).toBe('tab');
	});
});
