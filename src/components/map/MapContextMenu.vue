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
	<nav role="none" id="map-context-menu" ref="menuElement" :style="style" @keydown="handleKeydown">
		<v-list class="context-menu__list" density="compact">
			<v-list-item
				v-clipboard:copy="locationCopy"
				v-clipboard:success="copySuccess"
				v-clipboard:error="copyError">
				<v-list-item-title>{{ locationLabel }}</v-list-item-title>
			</v-list-item>
			<v-list-item
				v-clipboard:copy="url"
				v-clipboard:success="copySuccess"
				v-clipboard:error="copyError">
				<v-list-item-title>{{ messageCopyLink }}</v-list-item-title>
			</v-list-item>
			<v-list-item @click.prevent="pan">
				<v-list-item-title>{{ messageCenterHere }}</v-list-item-title>
			</v-list-item>
			<WorldListItem v-if="currentMap && mapCount > 1" :world="currentMap.appendedWorld || currentMap.world" name="context"></WorldListItem>
		</v-list>
	</nav>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, onUnmounted, watch, CSSProperties, ref, nextTick} from "vue";
import {LeafletMouseEvent} from "leaflet";
import {useStore} from "@/store";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import WorldListItem from "@/components/list/WorldListItem.vue";
import {clipboardError, clipboardSuccess, getUrlForLocation} from "@/util";
import {handleKeyboardEvent} from "@/util/events";

export default defineComponent({
	name: "MapContextMenu",
	components: {WorldListItem},
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		}
	},

	setup(props) {
		const store = useStore(),
			event = ref<LeafletMouseEvent | null>(null),
			lastMouseMoveEvent = ref<LeafletMouseEvent | null>(null),

			messageCopyLink = computed(() => store.state.messages.contextMenuCopyLink),
			messageCenterHere = computed(() => store.state.messages.contextMenuCenterHere),

			menuElement = ref<HTMLInputElement | null>(null),
			menuVisible = computed(() => !!event.value),

			currentMap = computed(() => store.state.currentMap),
			currentZoom = computed(() => store.state.currentZoom),
			mapCount = computed(() => {
				if(!currentMap.value) {
					return 0;
				}

				return currentMap.value?.appendedWorld ?
					currentMap.value?.appendedWorld.maps.size : currentMap.value.world.maps.size;
			}),

			location = computed(() => {
				if (!event.value || !currentMap.value) {
					return {x: 0, y: 0, z: 0}
				}

				return currentMap.value.latLngToLocation(event.value.latlng, 64);
			}),

			locationLabel = computed(() => {
				return `X: ${Math.round(location.value.x)}, Z: ${Math.round(location.value.z)}`;
			}),

			locationCopy = computed(() => {
				return `${Math.round(location.value.x)}, ${Math.round(location.value.z)}`;
			}),

			embedBaseUrl = new URLSearchParams(window.location.search).get('embedBaseUrl'),

			url = computed(() => {
				if (!currentMap.value) {
					return '';
				}

				const hash = getUrlForLocation(currentMap.value, location.value, currentZoom.value);

				if (embedBaseUrl) {
					return embedBaseUrl + hash;
				}

				const url = new URL(window.location.href);
				url.hash = hash;
				return url;
			}),

			style = computed(() => {
				if (!event.value) {
					return {
						'visibility': 'hidden',
						'left': '-1000px',
					} as CSSProperties;
				}

				const x = Math.min(
					window.innerWidth - menuElement.value!.offsetWidth - 10,
					event.value.originalEvent.clientX
					),
					y = Math.min(
						window.innerHeight - menuElement.value!.offsetHeight - 10,
						event.value.originalEvent.clientY
					);

				return {
					'transform': `translate(${x}px, ${y}px)`
				}
			});

		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape" && menuVisible.value) {
				closeContextMenu();
			}
		};

		const handleKeydown = (e: KeyboardEvent) => {
			handleKeyboardEvent(e, Array.from(menuElement.value!.querySelectorAll('.v-list-item, button, input')));
		}

		const focusFirstItem = () => {
			if(menuElement.value) {
				const firstItem = menuElement.value.querySelector('.v-list-item');

				if(firstItem) {
					(firstItem as HTMLElement).focus();
				}
			}
		};

		const closeContextMenu = () => event.value = null;

		const pan = () => {
			if (event.value) {
				props.leaflet.panTo(event.value.latlng);
				props.leaflet.getContainer().focus();
			}
		}

		watch(event, value => {
			if(value) {
				props.leaflet.closePopup();
				nextTick(() => menuElement.value && focusFirstItem());
			}
		});

		onMounted(() => {
			window.addEventListener('click', closeContextMenu);
			window.addEventListener('keyup', handleEsc);
		});

		onUnmounted(() => {
			window.removeEventListener('click', closeContextMenu);
			window.removeEventListener('keyup', handleEsc);
		});

		props.leaflet.on('movestart', closeContextMenu);
		props.leaflet.on('zoomstart', closeContextMenu);

		props.leaflet.on('contextmenu', (e: LeafletMouseEvent) => {
			if(e.originalEvent.target && (e.originalEvent.target as HTMLElement).closest('.leaflet-control')) {
				return;
			}

			e.originalEvent.stopImmediatePropagation();
			e.originalEvent.preventDefault();
			event.value = e;
		});

		props.leaflet.on('mousemove', (e: LeafletMouseEvent) => {
			lastMouseMoveEvent.value = e;
		});

		window.addEventListener('contextmenu', e => {
			if(e.target && e.target instanceof HTMLElement && e.target.classList.contains('leaflet-zoom-animated')) {
				e.preventDefault();
				e.stopImmediatePropagation();

				if(lastMouseMoveEvent.value) {
					event.value = lastMouseMoveEvent.value;
				}
			}
		});

		return {
			messageCopyLink,
			messageCenterHere,

			copySuccess: clipboardSuccess(store),
			copyError: clipboardError(store),

			menuVisible,
			menuElement,
			url,

			locationLabel,
			locationCopy,
			currentMap,
			mapCount,
			style,

			pan,
			handleKeydown,
		}
	},
})
</script>

<style lang="scss" scoped>
	#map-context-menu {
		position: fixed;
		z-index: 150;
		min-width: 15rem;
		max-width: 22.5rem;
		top: 0;
		left: 0;

		.context-menu__list {
			background-color: var(--background-base) !important;
			backdrop-filter: blur(24px) saturate(1.2);
			-webkit-backdrop-filter: blur(24px) saturate(1.2);
			box-shadow: var(--box-shadow);
			color: var(--text-base);
			border-radius: var(--border-radius);
			border: 1px solid var(--border-color);
			padding: 0.4rem;
		}

		:deep(.v-list-item) {
			min-height: 3.6rem;
			padding: 0 1.2rem;
			cursor: pointer;
			border-radius: calc(var(--border-radius) - 0.2rem);

			&:hover {
				background-color: var(--background-light);
			}
		}

		:deep(.v-list-item-title) {
			font-size: 1.5rem;
		}

		::v-deep(.world) {
			padding: 0.2rem 0 0.2rem 0.8rem;
			margin-bottom: 0;

			li {
				width: 2.8rem;
				height: 2.8rem;
			}
		}

		@media screen and (max-width: 767px) {
			bottom: 0.5rem;
			top: auto;
			left: 0;
			right: 0;
			margin: auto;
			width: 90vw;
			max-width: 40rem;
			overflow: auto;
			transform: none !important;

			&:before {
				content: '';
				position: fixed;
				top: auto;
				right: 0;
				bottom: 0;
				left: 0;
				display: block;
				height: 40rem;
				background-image: linear-gradient(0deg, var(--background-dark), transparent);
				z-index: -1;
			}
		}
	}
</style>
