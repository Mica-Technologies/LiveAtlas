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
				v-clipboard:copy="tpCommand"
				v-clipboard:success="copySuccess"
				v-clipboard:error="copyError">
				<v-list-item-title>Copy /tp command</v-list-item-title>
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
			<v-list-item @click.prevent="saveBookmark">
				<v-list-item-title>Save view as bookmark…</v-list-item-title>
			</v-list-item>
			<v-list-item @click.prevent="openBookmarks">
				<v-list-item-title>Bookmarks…</v-list-item-title>
			</v-list-item>
			<template v-if="editorActive">
				<!-- Existing marker right-clicked: edit / queue deletion live
				     at the top of the editor section. Note: still show the
				     'Add … here' items below — the cursor is at a valid
				     location, and a user may want to add nearby. -->
				<template v-if="markerTarget">
					<v-list-item v-if="markerPendingState === 'none'"
						class="context-menu__editor-item" @click.prevent="beginEdit">
						<v-list-item-title>Edit in local editor</v-list-item-title>
					</v-list-item>
					<v-list-item v-if="markerPendingState !== 'delete'"
						class="context-menu__editor-item" @click.prevent="queueDelete">
						<v-list-item-title>{{ markerPendingState === 'edit' ? 'Queue deletion instead' : 'Queue deletion' }}</v-list-item-title>
					</v-list-item>
					<v-list-item v-if="markerPendingState === 'delete'"
						class="context-menu__editor-item" @click.prevent="toggleDelete">
						<v-list-item-title>Cancel deletion (edit instead)</v-list-item-title>
					</v-list-item>
					<v-list-item v-if="markerPendingState !== 'none'"
						class="context-menu__editor-item" @click.prevent="discardPending">
						<v-list-item-title>Discard pending change</v-list-item-title>
					</v-list-item>
				</template>
				<v-list-item class="context-menu__editor-item" @click.prevent="addLocal('point')">
					<v-list-item-title>Add point here</v-list-item-title>
				</v-list-item>
				<v-list-item class="context-menu__editor-item" @click.prevent="addLocal('area')">
					<v-list-item-title>Add area here</v-list-item-title>
				</v-list-item>
				<v-list-item class="context-menu__editor-item" @click.prevent="addLocal('line')">
					<v-list-item-title>Add line here</v-list-item-title>
				</v-list-item>
				<v-list-item class="context-menu__editor-item" @click.prevent="addLocal('circle')">
					<v-list-item-title>Add circle here</v-list-item-title>
				</v-list-item>
			</template>
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
import {MutationTypes} from "@/store/mutation-types";
import {
	createDefaultPoint,
	generateMarkerId,
	LocalEditorMarker,
	LocalEditorMarkerType,
	startArea,
	startCircle,
	startLine,
	stripLiveAtlasIdPrefix,
} from "@/util/localEditor";

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
			// The identity of the existing server marker right-clicked, if
			// any. Set when the marker's contextmenu handler tags the event;
			// otherwise null (i.e. the user right-clicked empty map).
			markerTarget = ref<{setId: string, markerId: string} | null>(null),

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

			// Dynmap's latLngToLocation defaults Y to 64 (passed above) since
			// the map projection doesn't carry elevation. /tp X Y Z drops the
			// player at sea level which is a sensible default for survival.
			tpCommand = computed(() => {
				const x = Math.round(location.value.x);
				const y = Math.round(location.value.y);
				const z = Math.round(location.value.z);
				return `/tp ${x} ${y} ${z}`;
			}),

			embedBaseUrl = new URLSearchParams(window.location.search).get('embedBaseUrl'),

			// Currently visible marker-set IDs, derived from the live
			// visibility map maintained by MarkerSetLayer. Snapshot at
			// link-generation time so a shared URL captures the user's
			// current view.
			visibleLayerIds = computed(() => {
				const visible: string[] = [];
				for(const [id, isVisible] of store.state.markerSetVisibility) {
					if(isVisible) visible.push(id);
				}
				return visible;
			}),

			url = computed(() => {
				if (!currentMap.value) {
					return '';
				}

				const hash = getUrlForLocation(
					currentMap.value, location.value, currentZoom.value, visibleLayerIds.value);

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

		const closeContextMenu = () => {
			event.value = null;
			markerTarget.value = null;
		};

		const pan = () => {
			if (event.value) {
				props.leaflet.panTo(event.value.latlng);
				props.leaflet.getContainer().focus();
			}
		}

		const saveBookmark = () => {
			if(!currentMap.value || !store.state.currentServer) return;
			const name = window.prompt('Name for this bookmark:');
			if(!name || !name.trim()) {
				closeContextMenu();
				return;
			}
			const world = currentMap.value.appendedWorld || currentMap.value.world;
			store.commit(MutationTypes.ADD_BOOKMARK, {
				id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				name: name.trim(),
				serverId: store.state.currentServer.id,
				worldName: world.name,
				mapName: currentMap.value.name,
				location: {...location.value},
				zoom: currentZoom.value,
				createdAt: Date.now(),
			});
			closeContextMenu();
		};

		const openBookmarks = () => {
			store.commit(MutationTypes.SHOW_UI_MODAL, 'bookmarks');
			closeContextMenu();
		};

		const editorActive = computed(() => store.state.localEditor.active);

		// Whether the right-clicked existing marker is already mirrored as
		// a pending edit/delete. The tag still carries the prefixed id
		// (matches the LiveAtlas layers map), but pending entries are
		// stored with the unprefixed server id — strip to compare.
		const markerPendingState = computed<'none' | 'edit' | 'delete'>(() => {
			const t = markerTarget.value;
			if(!t) return 'none';
			const serverId = stripLiveAtlasIdPrefix(t.markerId);
			const m = store.state.localEditor.markers.find(mm =>
				mm.id === serverId
				&& (mm.originalSetId === t.setId || mm.setId === t.setId));
			if(!m) return 'none';
			if(m.origin === 'delete') return 'delete';
			if(m.origin === 'edit') return 'edit';
			return 'none';
		});

		const currentWorldName = computed(() => store.state.currentWorld?.name);

		const beginEdit = () => {
			const t = markerTarget.value;
			if(!t || !currentWorldName.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_BEGIN_EDIT, {
				setId: t.setId,
				markerId: t.markerId,
				worldName: currentWorldName.value,
			});
			closeContextMenu();
		};

		const queueDelete = () => {
			const t = markerTarget.value;
			if(!t || !currentWorldName.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_QUEUE_DELETE, {
				setId: t.setId,
				markerId: t.markerId,
				worldName: currentWorldName.value,
			});
			closeContextMenu();
		};

		const toggleDelete = () => {
			const t = markerTarget.value;
			if(!t) return;
			store.commit(MutationTypes.LOCAL_EDITOR_TOGGLE_DELETE, t.markerId);
			closeContextMenu();
		};

		const discardPending = () => {
			const t = markerTarget.value;
			if(!t) return;
			store.commit(MutationTypes.LOCAL_EDITOR_DISCARD_EDIT, t.markerId);
			closeContextMenu();
		};

		const defaultSetId = computed(() => {
			// Prefer the user's first local set if any are defined, otherwise
			// fall back to the first existing real set, otherwise "markers".
			if(store.state.localEditor.sets.length) {
				return store.state.localEditor.sets[0].id;
			}
			const first = store.state.markerSets.values().next().value;
			return first ? first.id : 'markers';
		});

		const addLocal = (kind: LocalEditorMarkerType) => {
			if(!currentMap.value || !store.state.currentWorld) {
				return;
			}

			const id = generateMarkerId(store.state.localEditor.markers);
			const world = store.state.currentWorld.name;
			const set = defaultSetId.value;
			const loc = location.value;

			let marker: LocalEditorMarker;
			switch(kind) {
				case 'point':  marker = createDefaultPoint(id, world, set, loc); break;
				case 'area':   marker = startArea(id, world, set, loc); break;
				case 'line':   marker = startLine(id, world, set, loc); break;
				case 'circle': marker = startCircle(id, world, set, loc); break;
			}

			store.commit(MutationTypes.LOCAL_EDITOR_ADD_MARKER, marker);

			// Points are placed in one shot; everything else enters drawing mode
			// so the user can keep clicking to add vertices / set radius.
			if(kind !== 'point') {
				const drawingKind = kind === 'circle' ? 'circle-radius' : kind;
				store.commit(MutationTypes.LOCAL_EDITOR_START_DRAWING, {id, kind: drawingKind});
			}

			closeContextMenu();
		};

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
			// If the right-click hit an existing server marker, its
			// contextmenu handler ran first and tagged the underlying DOM
			// event with the marker's identity (see MapMarkers.vue).
			const tagged = (e.originalEvent as unknown as {_editorMarkerTarget?: {setId: string, markerId: string}})._editorMarkerTarget;
			markerTarget.value = tagged ?? null;
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
			tpCommand,
			currentMap,
			mapCount,
			style,

			pan,
			saveBookmark,
			openBookmarks,
			handleKeydown,

			editorActive,
			addLocal,

			markerTarget,
			markerPendingState,
			beginEdit,
			queueDelete,
			toggleDelete,
			discardPending,
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
			backdrop-filter: blur(8px) saturate(1.2);
			-webkit-backdrop-filter: blur(8px) saturate(1.2);
			box-shadow: var(--box-shadow);
			color: var(--text-base);
			border-radius: var(--border-radius);
			border: 1px solid var(--border-color);
			padding: 0.4rem;
		}

		body.always-opaque & .context-menu__list {
			background-color: var(--background-base-solid) !important;
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
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

		.context-menu__editor-item :deep(.v-list-item-title) {
			color: #f6a623;
			font-weight: 500;
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
