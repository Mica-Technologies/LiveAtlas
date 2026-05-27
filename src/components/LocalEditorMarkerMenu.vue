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
			<v-list-subheader class="local-editor-marker-menu__subheader">
				{{ menuSubheader }}
			</v-list-subheader>
			<template v-if="pendingState === 'none'">
				<v-list-item @click="beginEdit">
					<v-list-item-title>Edit in local editor</v-list-item-title>
				</v-list-item>
				<v-list-item @click="queueDelete">
					<v-list-item-title>Queue deletion</v-list-item-title>
				</v-list-item>
			</template>
			<template v-else-if="pendingState === 'edit'">
				<v-list-item @click="selectPending">
					<v-list-item-title>Reveal in editor</v-list-item-title>
				</v-list-item>
				<v-list-item @click="queueDelete">
					<v-list-item-title>Queue deletion instead</v-list-item-title>
				</v-list-item>
				<v-list-item @click="discardPending">
					<v-list-item-title>Discard edit</v-list-item-title>
				</v-list-item>
			</template>
			<template v-else-if="pendingState === 'delete'">
				<v-list-item @click="restoreToEdit">
					<v-list-item-title>Cancel deletion (edit instead)</v-list-item-title>
				</v-list-item>
				<v-list-item @click="discardPending">
					<v-list-item-title>Discard deletion</v-list-item-title>
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
	name: 'LocalEditorMarkerMenu',

	setup() {
		const store = useStore(),
			menuState = computed(() => store.state.localEditor.markerMenu),
			worldName = computed(() => store.state.currentWorld?.name),
			menuTarget = computed<[number, number]>(() => [menuState.value.x, menuState.value.y]);

		// Is the targeted marker already mirrored in the local editor?
		const pendingState = computed<'none' | 'edit' | 'delete'>(() => {
			const {setId, markerId} = menuState.value;
			if(!setId || !markerId) return 'none';
			const m = store.state.localEditor.markers.find(mm =>
				mm.id === markerId
				&& (mm.originalSetId === setId || mm.setId === setId));
			if(!m) return 'none';
			if(m.origin === 'delete') return 'delete';
			if(m.origin === 'edit') return 'edit';
			return 'none';
		});

		const menuSubheader = computed(() => {
			const {setId, markerId} = menuState.value;
			return `${setId} · ${markerId}`;
		});

		const menuOpen = computed({
			get: () => menuState.value.open,
			set: (val: boolean) => {
				if(!val) store.commit(MutationTypes.LOCAL_EDITOR_CLOSE_MARKER_MENU, undefined);
			},
		});

		const beginEdit = () => {
			if(!worldName.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_BEGIN_EDIT, {
				setId: menuState.value.setId,
				markerId: menuState.value.markerId,
				worldName: worldName.value,
			});
		};

		const queueDelete = () => {
			if(!worldName.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_QUEUE_DELETE, {
				setId: menuState.value.setId,
				markerId: menuState.value.markerId,
				worldName: worldName.value,
			});
		};

		const selectPending = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_SELECT_MARKER, menuState.value.markerId);
		};

		const discardPending = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_DISCARD_EDIT, menuState.value.markerId);
		};

		const restoreToEdit = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_TOGGLE_DELETE, menuState.value.markerId);
		};

		return {
			menuOpen,
			menuTarget,
			menuSubheader,
			pendingState,
			beginEdit,
			queueDelete,
			selectPending,
			discardPending,
			restoreToEdit,
		};
	},
});
</script>

<style lang="scss">
	.local-editor-marker-menu__subheader {
		font-size: 1.1rem;
		font-family: monospace;
		color: var(--text-subtle);
		padding-inline: 1.2rem;
		max-width: 24rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
