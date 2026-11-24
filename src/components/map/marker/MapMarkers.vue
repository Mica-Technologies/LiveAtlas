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
		// Looked up once per marker, so keep the ids in a set rather than scanning the editor's list
		const suppressedIds = computed(() => new Set(store.state.localEditor.markers
			.filter(m => (m.origin === 'edit' || m.origin === 'delete')
				&& (m.originalSetId === props.set.id || m.setId === props.set.id))
			.map(m => m.id)));

		const isSuppressed = (markerId: string): boolean =>
			suppressedIds.value.has(stripLiveAtlasIdPrefix(markerId));

		// Point markers are drawn on the shared icon canvas, which stays fast with thousands of them.
		// Sets whose labels are always shown keep HTML markers, as their labels can hold HTML.
		const canvasIcons = () => !props.layerGroup.options.showLabels;

		const createMarkers = () => {
			nonReactiveState.markers.get(props.set.id)!.forEach((area: LiveAtlasMarker, id: string) => {
				const layer = createMarkerLayer(area, converter, canvasIcons());

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
				const layer = updateMarkerLayer(layers.get(update.id), update.payload as LiveAtlasAreaMarker, converter, canvasIcons());

				if(!layers.has(update.id)) {
					wireContextMenu(layer, update.id);
				}

				if(!isSuppressed(update.id)) {
					if(!layers.has(update.id)) {
						props.layerGroup.addLayer(layer);
					} else {
						// It may have moved into or out of view, or had its zoom limits changed
						props.layerGroup.refreshLayer(layer);
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

		// React to a ping request from elsewhere in the UI (e.g. the marker
		// sidebar list). Add the highlight class to the matching layer's
		// DOM element and remove it once the CSS animation has played. We
		// delay the start slightly so the pan-to animation finishes first
		// and the user actually sees the pulse.
		watch(() => store.state.pingTarget, (target) => {
			if(!target || target.setId !== props.set.id) return;
			const layer = layers.get(target.markerId) as Layer & {getElement?: () => HTMLElement | SVGElement | undefined, ping?: (map?: unknown) => void} | undefined;
			window.setTimeout(() => {
				// Canvas icons have no element: they draw their own highlight
				if(layer?.ping) {
					layer.ping((props.layerGroup as any)._map);
					return;
				}

				// Look the element up once the pan has finished: markers away from the view aren't
				// on the map until it gets there
				const el = layer?.getElement?.();
				if(!el) return;
				el.classList.add('marker--ping');
				window.setTimeout(() => el.classList.remove('marker--ping'), 1500);
			}, 450);
		});

		watch(currentMap, (newValue, oldValue) => {
			if(newValue && (!oldValue || oldValue.world === newValue.world)) {
				//Prevent error if this marker set has just been removed due to the map change
				if(nonReactiveState.markers.has(props.set.id)) {
					converter = newValue.locationToLatLng.bind(newValue);

					for (const [id, area] of nonReactiveState.markers.get(props.set.id)!) {
						updateMarkerLayer(layers.get(id), area, converter, canvasIcons());
					}

					// The map's own view change has already culled markers by their old positions
					props.layerGroup.refresh();
				}
			}
		});

		// Switching a set's labels on or off changes which kind of marker it needs, so rebuild them.
		// The set's layer group has been updated by the time this runs (its watcher is the parent's).
		watch(() => props.set.showLabels || store.state.components.markers.showLabels, () => {
			for(const layer of layers.values()) {
				props.layerGroup.removeLayer(layer);
			}

			layers.clear();
			createMarkers();
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
