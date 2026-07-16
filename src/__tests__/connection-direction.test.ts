import { describe, expect, it } from 'vitest';
import {
	getConnectionDirectionIcon,
	getConnectionDirectionLabel,
} from '../ui/connection-direction';

describe('connection direction display', () => {
	it.each([
		['directed', 'arrow-right', 'One-way'],
		['bidirectional', 'arrow-left-right', 'Two-way'],
		['reverse', 'undo-2', 'Reverse'],
	] as const)('maps %s to its icon and label', (mode, icon, label) => {
		expect(getConnectionDirectionIcon(mode)).toBe(icon);
		expect(getConnectionDirectionLabel(mode)).toBe(label);
	});
});
