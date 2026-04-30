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
	<v-list ref="list" v-if="!currentSet" density="compact" :aria-labelledby="ariaLabelledby">
		<v-list-item v-for="[id, markerSet] in markerSets" :key="id" @click="currentSet = markerSet">
			<v-list-item-title>{{ markerSet.label || id }}</v-list-item-title>
			<v-list-item-subtitle>{{ markerCounts.get(markerSet) }} Marker(s)</v-list-item-subtitle>
		</v-list-item>
	</v-list>

	<template v-else>
		<div ref="subHeader" class="markers__header">
			<v-btn ref="backButton" icon variant="text" size="small" class="markers__back" @click.prevent="currentSet = undefined">
				<SvgIcon name="arrow" />
			</v-btn>
			<h3 class="markers__set">{{ currentSet.label }}</h3>
		</div>
		<MarkerList ref="submenu" :marker-set="currentSet" @keydown="onSubmenuKeydown"></MarkerList>
	</template>
</template>

<script lang="ts">
import {ComponentPublicInstance, defineComponent, nextTick, onMounted, ref, onUnmounted, watch} from 'vue';
import {LiveAtlasMarkerSet} from "@/index";
import {DynmapMarkerUpdate} from "@/dynmap";
import {nonReactiveState} from "@/store/state";
import MarkerList from "@/components/list/MarkerList.vue";
import SvgIcon from "@/components/SvgIcon.vue";
import {registerUpdateHandler, unregisterUpdateHandler} from "@/util/markers";

export default defineComponent({
	name: 'MarkerSetList',
	components: {
		SvgIcon,
		MarkerList,
	},

	props: {
		markerSets: {
			type: Object as () => Map<string, LiveAtlasMarkerSet>,
			required: true
		},
		ariaLabelledby: {
			type: String,
			default: '',
		}
	},

	setup(props) {
		const markerCounts = ref<Map<LiveAtlasMarkerSet, number>>(new Map()),
			currentSet = ref<LiveAtlasMarkerSet | undefined>(undefined),
			list = ref<ComponentPublicInstance | null>(null),
			subHeader = ref<HTMLElement | null>(null),
			backButton = ref<ComponentPublicInstance | null>(null);

		const checkSets = () => {
			props.markerSets?.forEach((set) => checkSet(set));
		};

		const checkSet = (set: LiveAtlasMarkerSet) => {
			const markers = nonReactiveState.markers.get(set.id),
				markerCount = markers ? markers.size : 0;

			markerCounts.value.set(set, markerCount);
		};

		const handleUpdate = (update: DynmapMarkerUpdate) => {
			checkSet(props.markerSets.get(update.set)!);
		}

		const onSubmenuKeydown = (e: KeyboardEvent) => {
			if(e.key === 'Backspace') {
				currentSet.value = undefined;
				e.preventDefault();
			}
		}

		const updateFocus = (newValue?: LiveAtlasMarkerSet, oldValue?: LiveAtlasMarkerSet) => {
			let focusTarget;

			if(newValue) {
				const parent = subHeader.value?.parentNode;
				focusTarget = parent?.querySelector('.menu input, .v-list-item') || backButton.value?.$el;
			} else if(oldValue && list.value) {
				focusTarget = list.value.$el.querySelector(`[id="marker-set-${oldValue.id}"]`)
					|| list.value.$el.querySelector('.v-list-item');
			}

			if(focusTarget) {
				(focusTarget as HTMLElement).focus();
			}
		}

		watch(props.markerSets, () => checkSets());
		watch(currentSet, (newValue, oldValue) => nextTick(() => updateFocus(newValue, oldValue)));

		onMounted(() => {
			checkSets();
			registerUpdateHandler(handleUpdate);
		});
		onUnmounted(() => {
			unregisterUpdateHandler(handleUpdate);
		});

		return {
			markerCounts,
			currentSet,
			list,
			subHeader,
			backButton,
			onSubmenuKeydown,
		}
	}
});
</script>

<style lang="scss" scoped>
	.markers__back {
		flex-grow: 0;
		margin-right: 1rem;
		transform: rotate(90deg);
	}

	.markers__header {
		display: flex;
		align-items: center;
		padding-bottom: 1rem;
		position: sticky;
		top: 4.8rem;
		background-color: var(--background-base);
		z-index: 3;
	}

	.markers__set {
		flex: 1 1 auto;
		min-width: 0;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		margin: 0;
	}
</style>
