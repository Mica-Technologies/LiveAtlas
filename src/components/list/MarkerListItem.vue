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
	<v-list-item :title="marker.tooltip || messageUnnamed" :subtitle="locationText" @click="pan">
		<template #prepend>
			<img v-if="icon" width="16" height="16" class="marker__icon" :src="icon" alt="" />
			<SvgIcon v-else :name="defaultIcon" class="marker__icon" />
		</template>
	</v-list-item>
</template>

<script lang="ts">
import {defineComponent, computed} from 'vue';
import {useStore} from "@/store";
import {LiveAtlasMarker, LiveAtlasPathMarker, LiveAtlasPointMarker} from "@/index";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";
import {LiveAtlasMarkerType} from "@/util/markers";

export default defineComponent({
	name: 'MarkerListItem',
	components: {SvgIcon},
	props: {
		id: {
			type: String,
			required: true,
		},
		setId: {
			type: String,
			required: true,
		},
		marker: {
			type: Object as () => LiveAtlasMarker,
			required: true
		}
	},

	setup(props) {
		const store = useStore(),
			messageUnnamed = computed(() => store.state.messages.markersUnnamed),
			locationText = computed(() => {
				const x = Math.round(props.marker.location.x);
				const z = Math.round(props.marker.location.z);
				return `X: ${x}, Z: ${z}`;
			}),
			icon = computed(() => {
				if('iconUrl' in props.marker) {
					return (props.marker as LiveAtlasPointMarker).iconUrl;
				}

				return undefined;
			}),
			defaultIcon = computed(() => {
				switch(props.marker.type) {
					case LiveAtlasMarkerType.POINT:
          default:
						return 'marker_point';
					case LiveAtlasMarkerType.AREA:
						return 'marker_area';
					case LiveAtlasMarkerType.LINE:
						return 'marker_line';
					case LiveAtlasMarkerType.CIRCLE:
						return 'marker_circle';
				}
			});

		const pan = () => {
			if(props.marker.type === LiveAtlasMarkerType.POINT) {
				store.commit(MutationTypes.SET_VIEW_TARGET, {
					location: props.marker.location,
				});
			} else {
				store.commit(MutationTypes.SET_VIEW_TARGET, {
					location: (props.marker as LiveAtlasPathMarker).bounds,
					options: {
						padding: [10, 10]
					}
				});
			}
			store.commit(MutationTypes.PING_MARKER, {setId: props.setId, markerId: props.id});
		}

		return {
			icon,
			defaultIcon,
			messageUnnamed,
			pan,
			locationText,
		}
	}
});
</script>

<style lang="scss" scoped>
	.marker__icon {
		width: 1.6rem;
		height: 1.6rem;
		margin-right: 0.8rem;
	}

	:deep(.v-list-item-title) {
		font-size: 1.5rem;
	}

	:deep(.v-list-item-subtitle) {
		font-size: 1.3rem;
		font-family: monospace;
	}
</style>
