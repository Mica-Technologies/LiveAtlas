<!--
  - Copyright 2022 James Lyne
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<template>
	<v-menu v-model="menuOpen" :target="menuTarget" :open-on-click="false" :close-on-content-click="true">
		<v-list density="compact" class="sidebar-context-menu">
			<v-list-item v-if="!editorActive" @click="enterEditor">
				<v-list-item-title>Enter local editor</v-list-item-title>
			</v-list-item>
			<template v-else>
				<v-list-item @click="exitEditor">
					<v-list-item-title>Exit local editor</v-list-item-title>
				</v-list-item>
				<v-list-item @click="showCommands">
					<v-list-item-title>Get commands…</v-list-item-title>
				</v-list-item>
				<v-list-item v-if="hasPendingMarkers" @click="clearPending">
					<v-list-item-title>Clear pending markers</v-list-item-title>
				</v-list-item>
			</template>
		</v-list>
	</v-menu>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";

export default defineComponent({
	name: 'LocalEditorMenu',

	setup() {
		const store = useStore(),
			editorActive = computed(() => store.state.localEditor.active),
			hasPendingMarkers = computed(() => store.state.localEditor.markers.length > 0),
			menuTarget = computed<[number, number]>(() => [
				store.state.localEditor.menu.x,
				store.state.localEditor.menu.y,
			]);

		const menuOpen = computed({
			get: () => store.state.localEditor.menu.open,
			set: (val: boolean) => {
				if(!val) store.commit(MutationTypes.LOCAL_EDITOR_CLOSE_MENU, undefined);
			},
		});

		const enterEditor = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_ACTIVE, true);
		};
		const exitEditor = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_ACTIVE, false);
		};
		const showCommands = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL, true);
		};
		const clearPending = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_CLEAR_MARKERS, undefined);
		};

		return {
			menuOpen,
			menuTarget,
			editorActive,
			hasPendingMarkers,
			enterEditor,
			exitEditor,
			showCommands,
			clearPending,
		};
	},
});
</script>

<!--
  Not scoped: v-menu teleports its overlay content to the document body, and
  the .sidebar-context-menu class lives on the v-list inside that overlay.
  The global .v-list override in _vuetify-overrides.scss strips the
  background (so list-items can sit on a v-card backdrop); here we re-apply
  the glass treatment used by MapContextMenu so the floating menu reads.
-->
<style lang="scss">
	.sidebar-context-menu.v-list {
		background-color: var(--background-base) !important;
		backdrop-filter: blur(8px) saturate(1.2);
		-webkit-backdrop-filter: blur(8px) saturate(1.2);
		box-shadow: var(--box-shadow);
		color: var(--text-base) !important;
		border-radius: var(--border-radius) !important;
		border: 1px solid var(--border-color);
		padding: 0.4rem;

		.v-list-item {
			min-height: 3.6rem;
			padding: 0 1.2rem;
			cursor: pointer;
			border-radius: calc(var(--border-radius) - 0.2rem);

			&:hover {
				background-color: var(--background-light);
			}
		}

		.v-list-item-title {
			font-size: 1.5rem;
		}
	}
</style>
