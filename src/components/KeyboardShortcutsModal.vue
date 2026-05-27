<!--
  - Copyright 2026 LiveAtlas Contributors
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -->

<template>
	<v-dialog v-model="dialogVisible" max-width="40rem">
		<v-card class="shortcuts-dialog">
			<v-card-title class="shortcuts-dialog__header">
				<span>Keyboard shortcuts</span>
				<v-btn icon variant="text" size="small" aria-label="Close" @click="close">
					<SvgIcon name="cross" />
				</v-btn>
			</v-card-title>
			<v-card-text class="shortcuts-dialog__content">
				<dl class="shortcuts-list">
					<template v-for="row in shortcuts" :key="row.key">
						<dt><kbd>{{ row.key }}</kbd></dt>
						<dd>{{ row.label }}</dd>
					</template>
				</dl>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";

const shortcuts = [
	{key: '/', label: 'Search markers'},
	{key: 'G', label: 'Jump to coordinates'},
	{key: 'B', label: 'Open bookmarks'},
	{key: '?', label: 'Show this help'},
	{key: 'Esc', label: 'Close the current dialog'},
	{key: 'Arrows', label: 'Pan the map (when map has focus)'},
	{key: '+ / -', label: 'Zoom in / out (when map has focus)'},
];

export default defineComponent({
	name: 'KeyboardShortcutsModal',
	components: {SvgIcon},

	setup() {
		const store = useStore(),
			dialogVisible = computed({
				get: () => store.state.ui.visibleModal === 'shortcuts',
				set: (val: boolean) => {
					if(!val) store.commit(MutationTypes.HIDE_UI_MODAL, 'shortcuts');
				},
			});

		const close = () => store.commit(MutationTypes.HIDE_UI_MODAL, 'shortcuts');

		return {
			dialogVisible,
			close,
			shortcuts,
		};
	},
});
</script>

<style lang="scss" scoped>
	.shortcuts-dialog {
		background-color: var(--background-base);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		border: 1px solid var(--border-color);
	}

	.shortcuts-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem 0.5rem;
		font-size: 1.8rem;
	}

	.shortcuts-dialog__content {
		padding: 1rem 2rem 2rem;
	}

	.shortcuts-list {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.8rem 1.6rem;
		margin: 0;
		font-size: 1.5rem;

		dt {
			text-align: right;
			align-self: center;
		}

		dd {
			margin: 0;
			align-self: center;
			color: var(--text-base);
		}

		kbd {
			display: inline-block;
			padding: 0.2rem 0.7rem;
			min-width: 2.4rem;
			text-align: center;
			background-color: var(--background-light);
			border: 1px solid var(--border-color);
			border-radius: 0.4rem;
			font-family: 'JetBrains Mono', 'Fira Code', monospace;
			font-size: 1.3rem;
		}
	}
</style>
