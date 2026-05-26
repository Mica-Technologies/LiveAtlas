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
	<v-list-item :active="isFollowing" :title="player.displayName"
		:class="{'player--hidden': !!player.hidden, 'player--other-world': otherWorld}"
		@click="onClick" @dblclick="follow">
		<template #prepend>
			<PlayerImage v-if="imagesEnabled" :player="player" width="16" height="16" class="player__icon" aria-hidden="true" />
		</template>
	</v-list-item>
</template>

<script lang="ts">
import {defineComponent, computed} from 'vue';
import {LiveAtlasPlayer} from "@/index";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import PlayerImage from "@/components/PlayerImage.vue";

export default defineComponent({
	name: 'PlayerListItem',
	components: {PlayerImage},
	props: {
		player: {
			type: Object as () => LiveAtlasPlayer,
			required: true
		}
	},
	setup(props) {
		const store = useStore(),
			imagesEnabled = computed(() => store.state.components.players.showImages),

			otherWorld = computed(() => {
				return store.state.components.players.grayHiddenPlayers
					&& !props.player.hidden
					&& (!store.state.currentWorld || store.state.currentWorld.name !== props.player.location.world);
			}),

			isFollowing = computed(() => store.state.followTarget?.name === props.player.name),

			pan = () => {
				if(!props.player.hidden) {
					store.commit(MutationTypes.SET_VIEW_TARGET, {location: props.player.location});
				}
			},

			follow = () => store.commit(MutationTypes.SET_FOLLOW_TARGET, props.player),

			onClick = (e: MouseEvent) => {
				if(e.shiftKey) {
					follow();
				} else {
					pan();
				}
			};

		return {
			imagesEnabled,
			otherWorld,
			isFollowing,
			onClick,
			follow,
		}
	},

});
</script>

<style lang="scss" scoped>
	:deep(.v-list-item-title) {
		font-size: 1.5rem;
	}

	.player--hidden,
	.player--other-world {
		opacity: 0.5;

		&:hover {
			opacity: 1;
		}
	}

	.player--hidden {
		.player__icon {
			filter: grayscale(1);
		}
	}

	.player__icon {
		margin-right: 0.8rem;
	}
</style>
