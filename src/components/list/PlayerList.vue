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
	<v-text-field ref="searchInput" v-if="filteredPlayers && search" class="section__search"
		v-model="searchQuery" :placeholder="messagePlayersSearchPlaceholder"
		@keydown="onKeydown" hide-details single-line density="compact" variant="outlined" clearable />
	<v-list v-if="filteredPlayers.length" density="compact" :aria-labelledby="ariaLabelledby">
		<PlayerListItem v-for="player in filteredPlayers" :key="player.name" :player="player"></PlayerListItem>
	</v-list>
	<div v-else-if="searchQuery" class="section__skeleton">{{ messageSkeletonPlayersSearch }}</div>
	<div v-else class="section__skeleton">{{ messageSkeletonPlayers }}</div>
</template>

<script lang="ts">
import {ref, computed, defineComponent, watch} from "vue";
import {LiveAtlasPlayer} from "@/index";
import {useStore} from "@/store";
import PlayerListItem from "./PlayerListItem.vue";

export default defineComponent({
	components: {
		PlayerListItem
	},
	props: {
		search: {
			type: Boolean,
			default: true,
		},
		players: {
			type: Object as () => LiveAtlasPlayer[],
			required: true,
		},
		ariaLabelledby: {
			type: String,
			default: '',
		}
	},

	setup(props) {
		const store = useStore(),
			messageSkeletonPlayers = computed(() => store.state.messages.playersSkeleton),
			messageSkeletonPlayersSearch = computed(() => store.state.messages.playersSearchSkeleton),
			messagePlayersSearchPlaceholder = computed(() => store.state.messages.playersSearchPlaceholder),

			searchQuery = ref(""),
			searchInput = ref<InstanceType<typeof import('vuetify/components').VTextField> | null>(null),

			filteredPlayers = computed(() => {
				const query = searchQuery.value.toLowerCase();

				return query ? props.players.filter(p => {
					return p.name.toLowerCase().indexOf(query) > -1;
				}) : props.players;
			}),

			onKeydown = (e: KeyboardEvent) => {
				e.stopImmediatePropagation();
			};

		watch(searchQuery, () => {
			const el = searchInput.value?.$el;
			if (el && el.nextElementSibling) {
				el.nextElementSibling.scrollIntoView();
			}
		});

		return {
			messageSkeletonPlayers,
			messageSkeletonPlayersSearch,
			messagePlayersSearchPlaceholder,

			searchQuery,
			searchInput,

			filteredPlayers,
			onKeydown
		}
	}
});
</script>
