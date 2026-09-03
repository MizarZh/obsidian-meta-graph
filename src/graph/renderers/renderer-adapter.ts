/**
 * Public renderer boundary.
 *
 * Implementation-specific creation, capability, and refresh logic lives in
 * sibling modules. Keeping these re-exports preserves the existing import
 * path while making each concern independently testable.
 */
export {
	getModeCapabilities,
	getRendererKindForMode,
	type GraphRenderer,
	type ModeCapabilities,
	type RendererCapabilities,
	type RendererKind,
} from './renderer-capabilities';
export {
	getRendererCapabilities,
	getRendererKind,
	isCube3DRenderer,
	isForce3DRenderer,
} from './renderer-instance';
export type { GraphRendererOptions } from './renderer-options';
export { createGraphRenderer } from './renderer-factory';
export {
	refreshRendererGraphStyles,
	refreshRendererGraphVisibility,
	setRendererManualLayout,
	setRendererPalette,
} from './renderer-refresh';
