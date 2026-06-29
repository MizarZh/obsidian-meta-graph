import type { DockConnectionDirection } from '../../core/types';

export type DockDragPayload =
	| {
			kind: 'template';
			templateId: string;
			label: string;
	  }
	| {
			kind: 'note';
			notePath: string;
			label: string;
			direction: DockConnectionDirection;
			relationField: string;
	  }
	| {
			kind: 'broken-note';
			notePath: string;
			label: string;
	  };
