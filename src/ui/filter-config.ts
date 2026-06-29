import type { IconName } from "obsidian";
import type {
	KnowledgeNode,
	NodeFilterField,
	NodeFilterGroupMode,
	NodeFilterOperator,
	NodeStyleField,
} from "../core/types";

export interface SuggestionOption {
	value: string;
	label: string;
	detail?: string;
	searchText?: string;
}

export interface PropertyPickerOption {
	value: string;
	label: string;
	detail: string;
	icon: IconName;
}

export interface FilterOptionSources {
	folders: string[];
	tags: string[];
	metadataFieldSuggestions: string[];
	metadataFieldTypes: Record<string, string>;
	metadataFieldValueSuggestions: Record<string, string[]>;
	filePathSuggestions: string[];
}

export const SYSTEM_FILTER_FIELD_OPTIONS = [
	{ value: "file.file", label: "File", icon: "file" },
	{ value: "file.name", label: "Name", icon: "align-left" },
	{ value: "file.basename", label: "File name", icon: "align-left" },
	{ value: "file.fullname", label: "Full name", icon: "align-left" },
	{ value: "file.path", label: "Path", icon: "align-left" },
	{ value: "file.folder", label: "Folder", icon: "align-left" },
	{ value: "file.ext", label: "Extension", icon: "align-left" },
	{ value: "file.ctime", label: "Created time", icon: "clock" },
	{ value: "file.mtime", label: "Modified time", icon: "clock" },
	{ value: "file.size", label: "File size", icon: "binary" },
	{ value: "file.tags", label: "Tags", icon: "tags" },
	{ value: "file.links", label: "Links", icon: "list" },
	{ value: "file.embeds", label: "Embeds", icon: "list" },
	{ value: "aliases", label: "Aliases", icon: "corner-down-right" },
	{ value: "metadata-field", label: "Property", icon: "braces" },
] satisfies Array<{ value: NodeFilterField; label: string; icon: IconName }>;

export const FILE_FILTER_FIELD_OPTIONS = SYSTEM_FILTER_FIELD_OPTIONS.map(
	({ value, label }) => ({ value, label }),
);

export const FILE_FILTER_OPERATOR_OPTIONS = [
	{ value: "links-to", label: "links to" },
	{ value: "in-folder", label: "in folder" },
	{ value: "has-tag", label: "has tag" },
	{ value: "has-property", label: "has property" },
	{ value: "does-not-link-to", label: "does not link to" },
	{ value: "is-not-in-folder", label: "is not in folder" },
	{ value: "does-not-have-tag", label: "does not have tag" },
	{ value: "does-not-have-property", label: "does not have property" },
];

export const TEXT_FILTER_OPERATOR_OPTIONS = [
	{ value: "is", label: "is" },
	{ value: "is-not", label: "is not" },
	{ value: "starts-with", label: "starts with" },
	{ value: "ends-with", label: "ends with" },
	{ value: "is-empty", label: "is empty" },
	{ value: "is-not-empty", label: "is not empty" },
	{ value: "contains", label: "contains" },
	{ value: "contains-any-of", label: "contains any of" },
	{ value: "contains-all-of", label: "contains all of" },
	{ value: "does-not-start-with", label: "does not start with" },
	{ value: "does-not-end-with", label: "does not end with" },
	{ value: "does-not-contain", label: "does not contain" },
	{ value: "does-not-contain-any-of", label: "does not contain any of" },
	{ value: "does-not-contain-all-of", label: "does not contain all of" },
];

export const DATE_FILTER_OPERATOR_OPTIONS = [
	{ value: "on", label: "on" },
	{ value: "not-on", label: "not on" },
	{ value: "before", label: "before" },
	{ value: "on-or-before", label: "on or before" },
	{ value: "after", label: "after" },
	{ value: "on-or-after", label: "on or after" },
	{ value: "is-empty", label: "is empty" },
	{ value: "is-not-empty", label: "is not empty" },
];

export const NUMBER_FILTER_OPERATOR_OPTIONS = [
	{ value: "eq", label: "=" },
	{ value: "neq", label: "!=" },
	{ value: "lt", label: "<" },
	{ value: "lte", label: "<=" },
	{ value: "gt", label: ">" },
	{ value: "gte", label: ">=" },
	{ value: "is-empty", label: "is empty" },
	{ value: "is-not-empty", label: "is not empty" },
];

export const LIST_FILTER_OPERATOR_OPTIONS = [
	{ value: "is-exactly", label: "is exactly" },
	{ value: "is-not-exactly", label: "is not exactly" },
	{ value: "is-empty", label: "is empty" },
	{ value: "contains", label: "contains" },
	{ value: "contains-any-of", label: "contains any of" },
	{ value: "contains-all-of", label: "contains all of" },
	{ value: "is-not-empty", label: "is not empty" },
	{ value: "does-not-contain", label: "does not contain" },
	{ value: "does-not-contain-any-of", label: "does not contain any of" },
	{ value: "does-not-contain-all-of", label: "does not contain all of" },
];

export const CHECKBOX_FILTER_OPERATOR_OPTIONS = [
	{ value: "is", label: "is" },
	{ value: "is-not", label: "is not" },
];

export function getFilterFieldOptions(
	metadataFieldSuggestions: string[],
	metadataFieldTypes: Record<string, string>,
): PropertyPickerOption[] {
	return [
		...SYSTEM_FILTER_FIELD_OPTIONS.map((field) => ({
				value: field.value,
				label: field.label,
				detail: field.value,
				icon: field.icon,
			})),
		...metadataFieldSuggestions.map((field) => ({
			value: `metadata.${field}`,
			label: field,
			detail: metadataFieldTypeLabel(metadataFieldTypes[field]),
			icon: metadataFieldIcon(metadataFieldTypes[field]),
		})),
	];
}

export function getFilterOperatorOptions(
	field: NodeFilterField,
	metadataFieldTypes: Record<string, string>,
): Array<{ value: NodeFilterOperator; label: string }> {
	const type = getFilterFieldType(field, metadataFieldTypes);
	const options =
		type === "file"
			? FILE_FILTER_OPERATOR_OPTIONS
			: type === "date" || type === "datetime"
				? DATE_FILTER_OPERATOR_OPTIONS
				: type === "number"
					? NUMBER_FILTER_OPERATOR_OPTIONS
					: type === "list"
						? LIST_FILTER_OPERATOR_OPTIONS
						: type === "checkbox"
							? CHECKBOX_FILTER_OPERATOR_OPTIONS
							: TEXT_FILTER_OPERATOR_OPTIONS;
	return options as Array<{ value: NodeFilterOperator; label: string }>;
}

export function getDefaultFilterOperator(
	field: NodeFilterField,
	metadataFieldTypes: Record<string, string>,
): NodeFilterOperator {
	return getFilterOperatorOptions(field, metadataFieldTypes)[0]?.value ?? "is";
}

export function getFilterFieldType(
	field: NodeFilterField,
	metadataFieldTypes: Record<string, string>,
): string {
	if (field === "file.file") return "file";
	if (field === "file.ctime" || field === "file.mtime") return "datetime";
	if (field === "file.size") return "number";
	if (
		field === "file.links" ||
		field === "file.embeds" ||
		field === "file.tags" ||
		field === "aliases"
	) {
		return "list";
	}
	if (field.startsWith("metadata.")) {
		return metadataFieldTypes[field.slice("metadata.".length)] ?? "text";
	}
	return "text";
}

export function getFilterGroupModeOptions(): Array<{
	value: NodeFilterGroupMode;
	label: string;
}> {
	return [
		{ value: "all", label: "All the following are true" },
		{ value: "any", label: "Any of the following are true" },
		{ value: "none", label: "None of the following are true" },
	];
}

export function getNodeValueOptions(
	field: NodeFilterField | NodeStyleField,
	operator: NodeFilterOperator | undefined,
	sources: FilterOptionSources,
): SuggestionOption[] {
	if (field === "file.file") {
		if (operator === "in-folder" || operator === "is-not-in-folder") {
			return toSuggestionOptions(sources.folders);
		}
		if (operator === "has-tag" || operator === "does-not-have-tag") {
			return toSuggestionOptions(sources.tags);
		}
		if (
			operator === "has-property" ||
			operator === "does-not-have-property"
		) {
			return toSuggestionOptions(sources.metadataFieldSuggestions);
		}
		return toSuggestionOptions(sources.filePathSuggestions);
	}
	if (field === "file.path") return toSuggestionOptions(sources.filePathSuggestions);
	if (field === "file.folder" || field === "folder") {
		return toSuggestionOptions(sources.folders);
	}
	if (field === "file.tags" || field === "tag") {
		return toSuggestionOptions(sources.tags);
	}
	if (field === "metadata-field") {
		return toSuggestionOptions(sources.metadataFieldSuggestions);
	}
	if (field === "aliases") {
		return getMetadataValueOptions("metadata.aliases", sources);
	}
	if (field.startsWith("metadata.")) {
		return getMetadataValueOptions(field, sources);
	}
	return [];
}

export function metadataFieldIcon(type: string | undefined): IconName {
	switch (type) {
		case "list":
			return "list";
		case "date":
		case "datetime":
			return "clock";
		case "number":
			return "binary";
		case "checkbox":
			return "square-check";
		case "text":
		default:
			return "align-left";
	}
}

export function metadataFieldTypeLabel(type: string | undefined): string {
	switch (type) {
		case "list":
			return "List";
		case "date":
			return "Date";
		case "datetime":
			return "Date & time";
		case "number":
			return "Number";
		case "checkbox":
			return "Checkbox";
		case "text":
		default:
			return "Text";
	}
}

export function getMetadataFieldSuggestions(nodes: KnowledgeNode[]): string[] {
	return uniqueSorted(
		nodes.flatMap((node) =>
			(node.metadataFields ?? []).filter((field) => field !== "aliases"),
		),
	);
}

export function getMetadataFieldTypes(
	nodes: KnowledgeNode[],
): Record<string, string> {
	const types: Record<string, string> = {};
	for (const node of nodes) {
		for (const [field, value] of Object.entries(node.metadata ?? {})) {
			const nextType = inferMetadataFieldType(value);
			types[field] = mergeMetadataFieldType(types[field], nextType);
		}
	}
	return types;
}

export function getMetadataFieldValueSuggestions(
	nodes: KnowledgeNode[],
	fieldTypes: Record<string, string>,
): Record<string, string[]> {
	const values = new Map<string, Set<string>>();
	for (const node of nodes) {
		for (const [field, value] of Object.entries(node.metadata ?? {})) {
			const type = fieldTypes[field] ?? inferMetadataFieldType(value);
			if (
				type === "date" ||
				type === "datetime" ||
				type === "number" ||
				type === "checkbox"
			) {
				continue;
			}
			const fieldValues = values.get(field) ?? new Set<string>();
			for (const option of readMetadataValueSuggestions(value)) {
				fieldValues.add(option);
			}
			if (fieldValues.size > 0) {
				values.set(field, fieldValues);
			}
		}
	}
	return Object.fromEntries(
		[...values.entries()].map(([field, fieldValues]) => [
			field,
			[...fieldValues].sort((first, second) =>
				first.localeCompare(second, undefined, { sensitivity: "base" }),
			),
		]),
	);
}

export function inferMetadataFieldType(value: unknown): string {
	if (typeof value === "boolean") return "checkbox";
	if (typeof value === "number") return "number";
	if (Array.isArray(value)) return "list";
	if (value instanceof Date) return "datetime";
	if (typeof value === "string") {
		if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "date";
		if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/u.test(value)) {
			return "datetime";
		}
	}
	return "text";
}

export function mergeMetadataFieldType(
	current: string | undefined,
	next: string,
): string {
	if (!current || current === next) return next;
	if (current === "list" || next === "list") return "list";
	if (current === "text" || next === "text") return "text";
	if (
		(current === "date" && next === "datetime") ||
		(current === "datetime" && next === "date")
	) {
		return "datetime";
	}
	return "text";
}

export function uniqueSorted(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((first, second) =>
		first.localeCompare(second, undefined, { sensitivity: "base" }),
	);
}

function getMetadataValueOptions(
	field: string,
	sources: FilterOptionSources,
): SuggestionOption[] {
	const metadataField = field.slice("metadata.".length);
	const type = sources.metadataFieldTypes[metadataField];
	if (
		type === "date" ||
		type === "datetime" ||
		type === "number" ||
		type === "checkbox"
	) {
		return [];
	}
	return toSuggestionOptions(
		sources.metadataFieldValueSuggestions[metadataField] ?? [],
	);
}

function toSuggestionOptions(values: string[]): SuggestionOption[] {
	return values.map((value) => ({ value, label: value, searchText: value }));
}

function readMetadataValueSuggestions(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => readMetadataValueSuggestions(item))
			.filter(Boolean);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : [];
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return [String(value)];
	}
	return [];
}
