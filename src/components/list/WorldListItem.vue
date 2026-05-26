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
	<template v-if="singleMapWorlds">
		<v-list-item :active="isMapActive(maps[0])" @click="selectMap(maps[0])"
			:title="maps[0].world.displayName" />
	</template>
	<template v-else>
		<div v-if="maps.length" class="world">
			<span class="world__name" aria-hidden="true">{{ world.displayName }}</span>
			<div class="world__maps">
				<v-btn v-for="map in maps" :key="`${map.world.name}_${map.name}`"
					icon variant="text" size="small"
					:class="{'map--active': isMapActive(map)}"
					:title="`${map.world.displayName} - ${map.displayName}`"
					@click="selectMap(map)">
					<img v-if="map.hasCustomIcon()" :src="map.getIcon()" alt="" />
					<SvgIcon v-else :name="map.getIcon()" />
				</v-btn>
			</div>
		</div>
	</template>
</template>

<script lang="ts">
import {computed, defineComponent} from 'vue';
import {LiveAtlasWorldDefinition} from "@/index";
import LiveAtlasMapDefinition from "@/model/LiveAtlasMapDefinition";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";

export default defineComponent({
	name: 'WorldListItem',
	components: {SvgIcon},
	props: {
		world: {
			type: Object as () => LiveAtlasWorldDefinition,
			required: true
		},
		name: {
			type: String,
			default: 'map',
		}
	},

	setup(props) {
		const store = useStore(),
			singleMapWorlds = computed(() => store.state.configuration.singleMapWorlds),
			maps = computed(() => {
				const maps: LiveAtlasMapDefinition[] = [];

				props.world.maps.forEach(map => {
					if(!map.appendedWorld || map.appendedWorld.name === props.world.name) {
						maps.push(map);
					}
				});

				return maps;
			});

		const isMapActive = (map: LiveAtlasMapDefinition) => {
			return store.state.currentMap?.name === map.name
				&& store.state.currentWorld?.name === map.world.name;
		};

		const selectMap = (map: LiveAtlasMapDefinition) => {
			store.commit(MutationTypes.SET_CURRENT_MAP, {
				worldName: map.world.name,
				mapName: map.name
			});
		};

		return {
			singleMapWorlds,
			maps,
			isMapActive,
			selectMap,
		}
	}
});
</script>

<style lang="scss" scoped>
	.world {
		display: flex;
		align-items: center;
		margin-bottom: .5rem;
		padding-left: 0.8rem;

		.world__name {
			word-break: break-word;
			overflow-wrap: break-word;
		}

		.world__maps {
			display: flex;
			flex: 0 0 auto;
			flex-wrap: wrap;
			max-width: 11.1rem;
			align-items: center;
			margin-left: auto;
			padding-left: 1rem;
			padding-right: 0.2rem;
			list-style: none;
			margin-right: -0.5rem;
		}
	}

	.map--active {
		background-color: var(--background-light);
		outline: 2px solid var(--outline-focus);
	}

	:deep(.v-btn) {
		width: 3.2rem;
		height: 3.2rem;
		margin-right: 0.5rem;

		.svg-icon, img {
			width: 2.4rem;
			height: 2.4rem;
		}
	}
</style>
