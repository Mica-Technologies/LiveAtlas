/*
 * Ambient module declaration for .vue single-file components. Lives in its
 * own file (with no top-level imports) so that vue-tsc treats it as a
 * global ambient declaration rather than a module augmentation — the latter
 * is only picked up for files that already import from the surrounding
 * module, which leaves stray .vue imports from .ts files (e.g. main.ts,
 * test files) failing to resolve.
 */
declare module '*.vue' {
	import type {DefineComponent} from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}
