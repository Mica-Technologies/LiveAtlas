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

<script lang="ts">
import {defineComponent, computed, onMounted, watch, onUnmounted} from "vue";
import {Layer, LeafletMouseEvent} from "leaflet";
import {LiveAtlasAreaMarker, LiveAtlasMarker, LiveAtlasMarkerSet} from "@/index";
import {DynmapMarkerUpdate} from "@/dynmap";
import {useStore} from "@/store";
import {nonReactiveState} from "@/store/state";
import LiveAtlasLayerGroup from "@/leaflet/layer/LiveAtlasLayerGroup";
import {
	createMarkerLayer,
	registerSetUpdateHandler, unregisterSetUpdateHandler, updateMarkerLayer
} from "@/util/markers";
import {stripLiveAtlasIdPrefix} from "@/util/localEditor";

export default defineComponent({
	props: {
		set: {
			type: Object as () => LiveAtlasMarkerSet,
			required: true,
		},
		layerGroup: {
			type: Object as () => LiveAtlasLayerGroup,
			required: true
		}
	},

	setup(props) {
		const store = useStore(),
			currentMap = computed(() => store.state.currentMap),
			layers = Object.freeze(new Map()) as Map<string, Layer>;

		let converter = currentMap.value!.locationToLatLng.bind(currentMap.value);

		// Right-click an existing server marker — tag the event with the
		// marker's identity so MapContextMenu (which fires next as the event
		// bubbles to the map) can surface Edit / Queue deletion items inside
		// the regular context menu. Two separate menus stacked on top of
		// each other was the previous UX; this keeps everything in one place.
		const wireContextMenu = (layer: Layer, markerId: string) => {
			layer.on('contextmenu', (e: LeafletMouseEvent) => {
				if(!store.state.localEditor.active) return;
				// Tag the underlying DOM event (not the Leaflet wrapper) —
				// the DOM event is preserved as the contextmenu bubbles from
				// the marker layer up to the map handler in MapContextMenu.
				(e.originalEvent as unknown as {_editorMarkerTarget?: object})._editorMarkerTarget = {
					setId: props.set.id,
					markerId,
				};
			});
		};

		// Whether the server marker is currently mirrored as an edit or
		// delete in the local editor — when true, hide it so the editable
		// copy stands alone. The LiveAtlas map keys markers by their
		// kind-prefixed id; pending entries store the unprefixed id, so
		// strip before comparing.
		const isSuppressed = (markerId: string): boolean => {
			const serverId = stripLiveAtlasIdPrefix(markerId);
			return store.state.localEditor.markers.some(m =>
				m.id === serverId
				&& (m.origin === 'edit' || m.origin === 'delete')
				&& (m.originalSetId === props.set.id || m.setId === props.set.id));
		};

		const createMarkers = () => {
			nonReactiveState.markers.get(props.set.id)!.forEach((area: LiveAtlasMarker, id: string) => {
				const layer = createMarkerLayer(area, converter);

				layers.set(id, layer);
				wireContextMenu(layer, id);
				if(!isSuppressed(id)) {
					props.layerGroup.addLayer(layer);
				}
			});
		};

		const deleteMarker = (id: string) => {
			let marker = layers.get(id);

			if(!marker) {
				return;
			}

			props.layerGroup.removeLayer(marker);
			layers.delete(id);
		};

		const handleUpdate = (update: DynmapMarkerUpdate) => {
			if(update.removed) {
				deleteMarker(update.id);
			} else {
				const layer = updateMarkerLayer(layers.get(update.id), update.payload as LiveAtlasAreaMarker, converter);

				if(!layers.has(update.id)) {
					wireContextMenu(layer, update.id);
				}

				if(!isSuppressed(update.id)) {
					if(!layers.has(update.id)) {
						props.layerGroup.addLayer(layer);
					}
				}

				layers.set(update.id, layer);
			}
		};

		// Reactively add/remove markers from the visible layer group as the
		// local editor's edit/delete entries change. Suppressed markers stay
		// in the `layers` map (so update handlers keep working) but are not
		// added to the rendered layer group.
		const editorSuppressionFingerprint = computed(() =>
			store.state.localEditor.markers
				.filter(m => m.origin === 'edit' || m.origin === 'delete')
				.filter(m => m.originalSetId === props.set.id || m.setId === props.set.id)
				.map(m => m.id).sort().join(','));

		watch(editorSuppressionFingerprint, () => {
			for(const [id, layer] of layers) {
				const suppressed = isSuppressed(id);
				const inGroup = props.layerGroup.hasLayer(layer);
				if(suppressed && inGroup) {
					props.layerGroup.removeLayer(layer);
				} else if(!suppressed && !inGroup) {
					props.layerGroup.addLayer(layer);
				}
			}
		});

		watch(currentMap, (newValue, oldValue) => {
			if(newValue && (!oldValue || oldValue.world === newValue.world)) {
				//Prevent error if this marker set has just been removed due to the map change
				if(nonReactiveState.markers.has(props.set.id)) {
					converter = newValue.locationToLatLng.bind(newValue);

					for (const [id, area] of nonReactiveState.markers.get(props.set.id)!) {
						updateMarkerLayer(layers.get(id), area, converter);
					}
				}
			}
		});

		onMounted(() => {
			createMarkers();
			registerSetUpdateHandler(handleUpdate, props.set.id);
		});
		onUnmounted(() => {
			unregisterSetUpdateHandler(handleUpdate, props.set.id);
		});
	},

	render() {
		return null;
	}
});
</script>
