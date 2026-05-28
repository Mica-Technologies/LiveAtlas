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
	<v-dialog v-model="dialogVisible" max-width="50rem" scrollable>
		<v-card class="bookmarks-dialog">
			<v-card-title class="bookmarks-dialog__header">
				<span>Bookmarks</span>
				<v-btn icon variant="text" size="small" aria-label="Close" @click="close">
					<SvgIcon name="cross" />
				</v-btn>
			</v-card-title>
			<v-card-text class="bookmarks-dialog__content">
				<p v-if="!visibleBookmarks.length" class="bookmarks-dialog__empty">
					No bookmarks yet. Right-click anywhere on the map and choose
					&ldquo;Save view as bookmark…&rdquo; to add one.
				</p>
				<v-list v-else density="compact">
					<v-list-item v-for="b in visibleBookmarks" :key="b.id" @click="recall(b)">
						<v-list-item-title>{{ b.name }}</v-list-item-title>
						<v-list-item-subtitle>{{ locationLabel(b) }}</v-list-item-subtitle>
						<template #append>
							<v-btn icon variant="text" size="x-small"
								title="Rename" aria-label="Rename"
								@click.stop="rename(b)">
								<SvgIcon name="link" />
							</v-btn>
							<v-btn icon variant="text" size="x-small"
								title="Delete" aria-label="Delete"
								@click.stop="remove(b)">
								<SvgIcon name="cross" />
							</v-btn>
						</template>
					</v-list-item>
				</v-list>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";
import {LiveAtlasBookmark} from "@/index";

export default defineComponent({
	name: 'BookmarksModal',
	components: {SvgIcon},

	setup() {
		const store = useStore(),
			dialogVisible = computed({
				get: () => store.state.ui.visibleModal === 'bookmarks',
				set: (val: boolean) => {
					if(!val) store.commit(MutationTypes.HIDE_UI_MODAL, 'bookmarks');
				},
			}),
			currentServerId = computed(() => store.state.currentServer?.id),

			// Bookmarks are scoped to the server they were saved on — recalling
			// a bookmark from a different server doesn't make sense, so hide
			// those from the list. They stay in localStorage for when the user
			// switches back.
			visibleBookmarks = computed(() => store.state.bookmarks
				.filter(b => b.serverId === currentServerId.value)
				.sort((a, b) => a.name.localeCompare(b.name)));

		const close = () => store.commit(MutationTypes.HIDE_UI_MODAL, 'bookmarks');

		const locationLabel = (b: LiveAtlasBookmark) =>
			`${b.worldName} — X: ${Math.round(b.location.x)}, Z: ${Math.round(b.location.z)}`;

		const recall = (b: LiveAtlasBookmark) => {
			store.commit(MutationTypes.SET_VIEW_TARGET, {
				location: b.location,
				map: b.mapName,
				zoom: b.zoom,
			});
			close();
		};

		const rename = (b: LiveAtlasBookmark) => {
			const next = window.prompt('Rename bookmark', b.name);
			if(next && next.trim() && next.trim() !== b.name) {
				store.commit(MutationTypes.RENAME_BOOKMARK, {id: b.id, name: next.trim()});
			}
		};

		const remove = (b: LiveAtlasBookmark) => {
			if(window.confirm(`Delete bookmark "${b.name}"?`)) {
				store.commit(MutationTypes.REMOVE_BOOKMARK, b.id);
			}
		};

		return {
			dialogVisible,
			visibleBookmarks,
			close,
			locationLabel,
			recall,
			rename,
			remove,
		};
	},
});
</script>

<style lang="scss" scoped>
	.bookmarks-dialog {
		background-color: var(--background-base);
		backdrop-filter: blur(8px) saturate(1.2);
		-webkit-backdrop-filter: blur(8px) saturate(1.2);
		border: 1px solid var(--border-color);

		body.always-opaque & {
			background-color: var(--background-base-solid);
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}
	}

	.bookmarks-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem 0.5rem;
		font-size: 1.8rem;
	}

	.bookmarks-dialog__content {
		padding: 1rem 2rem 2rem;
	}

	.bookmarks-dialog__empty {
		margin: 0;
		padding: 1rem 0;
		color: var(--text-subtle);
		font-size: 1.4rem;
		line-height: 1.4;
	}

	:deep(.v-list-item-title) {
		font-size: 1.5rem;
	}

	:deep(.v-list-item-subtitle) {
		font-size: 1.3rem;
		font-family: monospace;
	}
</style>
