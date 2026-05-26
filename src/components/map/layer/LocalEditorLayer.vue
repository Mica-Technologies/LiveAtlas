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
import {computed, defineComponent, onMounted, onUnmounted, watch} from "vue";
import {CircleMarker, Layer, LayerGroup, LeafletMouseEvent, Path, SVG} from "leaflet";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import {
	collectSnapTargets,
	findSnapTarget,
	LocalEditorAreaMarker,
	LocalEditorCircleMarker,
	LocalEditorLineMarker,
	LocalEditorMarker,
	LocalEditorPointMarker,
	PathStyle,
} from "@/util/localEditor";
import {Coordinate} from "@/index";
import LiveAtlasPolyline from "@/leaflet/vector/LiveAtlasPolyline";
import LiveAtlasPolygon from "@/leaflet/vector/LiveAtlasPolygon";
import {getCirclePoints} from "@/util/circles";
import {LiveAtlasAreaMarker, LiveAtlasCircleMarker, LiveAtlasLineMarker} from "@/index";
import {LiveAtlasMarkerType} from "@/util/markers";

const POINT_STYLE = {
	radius: 8,
	color: '#f6a623',
	fillColor: '#f6a623',
	fillOpacity: 0.45,
	weight: 2,
	dashArray: '4,4',
} as const;

const POINT_SELECTED_STYLE = {
	radius: 10,
	color: '#ffffff',
	fillColor: '#f6a623',
	fillOpacity: 0.75,
	weight: 3,
	dashArray: undefined,
} as const;

const SNAP_INDICATOR_STYLE = {
	radius: 6,
	color: '#22cc88',
	fillColor: '#22cc88',
	fillOpacity: 0.6,
	weight: 2,
} as const;

const EDITOR_PANE = 'local-editor';

// Shared SVG renderer for every pending shape. SVG uses CSS transforms
// during pan/zoom (no per-frame redraw) — unlike the canvas renderer the
// rest of the map uses (preferCanvas: true). Avoids paying a redraw cost
// for editor shapes on every drag frame.
const editorRenderer = new SVG({pane: EDITOR_PANE});

const pathLeafletOptions = (style: PathStyle, selected: boolean) => ({
	color: style.lineColor,
	opacity: style.lineOpacity,
	weight: style.lineWeight,
	fillColor: style.fillColor,
	fillOpacity: style.fillOpacity,
	dashArray: selected ? undefined : '6,4',
	pane: EDITOR_PANE,
	renderer: editorRenderer,
});

const pointLayerOptions = (selected: boolean) => ({
	...(selected ? POINT_SELECTED_STYLE : POINT_STYLE),
	pane: EDITOR_PANE,
	renderer: editorRenderer,
});

// Cheap stable string capturing every property whose change requires
// rebuilding the Leaflet layer. Selection state is intentionally NOT
// included — selection-only changes route through a restyle path.
const styleSig = (s: PathStyle) =>
	`${s.lineColor}|${s.lineOpacity}|${s.lineWeight}|${s.fillColor}|${s.fillOpacity}`;

const markerSignature = (m: LocalEditorMarker): string => {
	switch(m.type) {
		case 'point':
			return `p|${m.label}|${m.iconId}|${m.location.x},${m.location.y},${m.location.z}`;
		case 'circle':
			return `c|${m.label}|${m.center.x},${m.center.y},${m.center.z}|${m.radiusX}|${m.radiusZ}|${styleSig(m.style)}`;
		case 'area':
		case 'line': {
			const pts = m.points.map(p => `${p.x},${p.y},${p.z}`).join(';');
			return `${m.type[0]}|${m.label}|${pts}|${styleSig(m.style)}`;
		}
	}
};

interface CachedLayer {
	signature: string;
	marker: LocalEditorMarker;
	layer: Layer;
	selected: boolean;
}

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		},
	},

	setup(props) {
		const store = useStore(),
			currentWorld = computed(() => store.state.currentWorld),
			currentMap = computed(() => store.state.currentMap),
			markers = computed(() => store.state.localEditor.markers),
			selectedId = computed(() => store.state.localEditor.selectedId),
			drawing = computed(() => store.state.localEditor.drawing),
			snapEnabled = computed(() => store.state.localEditor.snapEnabled),
			layerGroup = new LayerGroup(),
			layerCache = new Map<string, CachedLayer>();

		let snapIndicator: CircleMarker | undefined;

		const visibleMarkers = computed((): LocalEditorMarker[] => {
			if(!currentWorld.value) return [];
			return markers.value.filter(m => m.worldName === currentWorld.value!.name);
		});

		// Memoized snap-target list — recomputed only when the marker array
		// or the current world changes, not on every mousemove.
		const snapTargets = computed((): Coordinate[] => {
			if(!currentWorld.value) return [];
			return collectSnapTargets(markers.value, currentWorld.value.name);
		});

		const bindLabel = (layer: any, label: string, id: string) => {
			layer.unbindTooltip();
			layer.bindTooltip(() => label || id, {
				direction: 'top',
				offset: [0, -8],
				className: 'local-editor-tooltip',
			});
		};

		const bindSelect = (layer: any, id: string) => {
			layer.off('click');
			layer.on('click', (e: LeafletMouseEvent) => {
				if(store.state.localEditor.drawing) return;
				e.originalEvent?.stopPropagation?.();
				store.commit(MutationTypes.LOCAL_EDITOR_SELECT_MARKER, id);
			});
		};

		const createPointLayer = (m: LocalEditorPointMarker, selected: boolean): CircleMarker | undefined => {
			const latLng = currentMap.value?.locationToLatLng(m.location);
			if(!latLng) return undefined;
			const layer = new CircleMarker(latLng, pointLayerOptions(selected));
			bindLabel(layer, m.label, m.id);
			bindSelect(layer, m.id);
			return layer;
		};

		const projectPoints = (points: Coordinate[]) => {
			const map = currentMap.value;
			if(!map) return [];
			return points.map(p => map.locationToLatLng(p));
		};

		const createAreaLayerFor = (m: LocalEditorAreaMarker, selected: boolean): LiveAtlasPolygon | LiveAtlasPolyline | undefined => {
			const map = currentMap.value;
			if(!map || m.points.length < 1) return undefined;
			const latLngs = projectPoints(m.points);
			// Render in-progress areas as a polyline so they're visible with <3 points
			if(m.points.length < 3) {
				const fakeLine = {
					style: pathLeafletOptions(m.style, true),
					bounds: {min: m.points[0], max: m.points[0]},
					points: m.points,
					id: m.id,
					type: LiveAtlasMarkerType.LINE,
					tooltip: m.label || m.id,
					location: m.points[0],
				} as unknown as LiveAtlasLineMarker;
				const layer = new LiveAtlasPolyline(latLngs, fakeLine);
				bindLabel(layer, m.label, m.id);
				bindSelect(layer, m.id);
				return layer;
			}
			const fakeArea = {
				style: pathLeafletOptions(m.style, selected),
				bounds: {min: m.points[0], max: m.points[0]},
				outline: false,
				points: m.points,
				id: m.id,
				type: LiveAtlasMarkerType.AREA,
				tooltip: m.label || m.id,
				location: m.points[0],
			} as unknown as LiveAtlasAreaMarker;
			const layer = new LiveAtlasPolygon(latLngs, fakeArea);
			bindLabel(layer, m.label, m.id);
			bindSelect(layer, m.id);
			return layer;
		};

		const createLineLayerFor = (m: LocalEditorLineMarker, selected: boolean): LiveAtlasPolyline | undefined => {
			const map = currentMap.value;
			if(!map || m.points.length < 1) return undefined;
			const latLngs = projectPoints(m.points);
			const fakeLine = {
				style: pathLeafletOptions(m.style, selected),
				bounds: {min: m.points[0], max: m.points[0]},
				points: m.points,
				id: m.id,
				type: LiveAtlasMarkerType.LINE,
				tooltip: m.label || m.id,
				location: m.points[0],
			} as unknown as LiveAtlasLineMarker;
			const layer = new LiveAtlasPolyline(latLngs, fakeLine);
			bindLabel(layer, m.label, m.id);
			bindSelect(layer, m.id);
			return layer;
		};

		const createCircleLayerFor = (m: LocalEditorCircleMarker, selected: boolean): Layer | undefined => {
			const map = currentMap.value;
			if(!map) return undefined;
			// Before radius is set, show just the center as a CircleMarker
			if(m.radiusX <= 0 && m.radiusZ <= 0) {
				const latLng = map.locationToLatLng(m.center);
				const layer = new CircleMarker(latLng, pointLayerOptions(true));
				bindLabel(layer, m.label, m.id);
				bindSelect(layer, m.id);
				return layer;
			}
			const fakeCircle = {
				location: m.center,
				radius: [m.radiusX, m.radiusZ] as [number, number],
				style: pathLeafletOptions(m.style, selected),
				bounds: {min: m.center, max: m.center},
				id: m.id,
				type: LiveAtlasMarkerType.CIRCLE,
				tooltip: m.label || m.id,
			} as unknown as LiveAtlasCircleMarker;
			const converter = map.locationToLatLng.bind(map);
			const points = getCirclePoints(fakeCircle, converter, false);
			const layer = new LiveAtlasPolygon(points, fakeCircle);
			bindLabel(layer, m.label, m.id);
			bindSelect(layer, m.id);
			return layer;
		};

		const buildLayer = (m: LocalEditorMarker, selected: boolean): Layer | undefined => {
			switch(m.type) {
				case 'point': return createPointLayer(m, selected);
				case 'area': return createAreaLayerFor(m, selected);
				case 'line': return createLineLayerFor(m, selected);
				case 'circle': return createCircleLayerFor(m, selected);
			}
		};

		// Cheap path for "only the selection changed" — swap the leaflet
		// style in place rather than rebuilding the layer.
		const restyleForSelection = (layer: Layer, marker: LocalEditorMarker, selected: boolean) => {
			if(marker.type === 'point') {
				// pane/renderer don't need re-setting — only the visual style.
				(layer as CircleMarker).setStyle(selected ? POINT_SELECTED_STYLE : POINT_STYLE);
				return;
			}
			// Path-based shapes — only the dashArray differs between states,
			// but pathLeafletOptions also reconfirms the other style fields.
			const style = (marker as LocalEditorAreaMarker | LocalEditorLineMarker | LocalEditorCircleMarker).style;
			(layer as Path).setStyle(pathLeafletOptions(style, selected));
		};

		// Diff-based reconcile: only changed markers are rebuilt; selection
		// changes are applied in place; unchanged markers are left alone.
		const reconcile = () => {
			const seen = new Set<string>();

			for(const marker of visibleMarkers.value) {
				const id = marker.id;
				seen.add(id);
				const sig = markerSignature(marker);
				const selected = id === selectedId.value;
				const cached = layerCache.get(id);

				if(!cached) {
					const layer = buildLayer(marker, selected);
					if(!layer) continue;
					layerGroup.addLayer(layer);
					layerCache.set(id, {signature: sig, marker, layer, selected});
				} else if(cached.signature !== sig) {
					layerGroup.removeLayer(cached.layer);
					const layer = buildLayer(marker, selected);
					if(!layer) {
						layerCache.delete(id);
						continue;
					}
					layerGroup.addLayer(layer);
					cached.signature = sig;
					cached.marker = marker;
					cached.layer = layer;
					cached.selected = selected;
				} else if(cached.selected !== selected) {
					restyleForSelection(cached.layer, marker, selected);
					cached.selected = selected;
					cached.marker = marker;
				}
			}

			for(const [id, entry] of layerCache) {
				if(!seen.has(id)) {
					layerGroup.removeLayer(entry.layer);
					layerCache.delete(id);
				}
			}
		};

		// Wipe the cache when the projection changes. Cheaper to start fresh
		// than to validate every cached latlng.
		const rebuildAll = () => {
			for(const entry of layerCache.values()) {
				layerGroup.removeLayer(entry.layer);
			}
			layerCache.clear();
			reconcile();
		};

		// Snap a clicked location to a nearby existing vertex (XZ only)
		// if snapping is enabled and Shift isn't held to override.
		const applySnap = (location: Coordinate, shiftHeld: boolean): Coordinate => {
			if(!snapEnabled.value || shiftHeld) return location;
			const targets = snapTargets.value;
			// Don't snap to the marker currently being drawn — its own vertices
			// would prevent the user from extending it freely.
			const filtered = drawing.value
				? targets.filter(t => {
					const m = markers.value.find(mm => mm.id === drawing.value!.id);
					if(!m) return true;
					if(m.type === 'area' || m.type === 'line') {
						return !m.points.includes(t as Coordinate);
					}
					return true;
				})
				: targets;
			const snapped = findSnapTarget(location, filtered);
			return snapped ? {x: snapped.x, y: location.y, z: snapped.z} : location;
		};

		const updateSnapIndicator = (latLng: any) => {
			if(!snapIndicator) {
				snapIndicator = new CircleMarker(latLng, {
					...SNAP_INDICATOR_STYLE,
					pane: EDITOR_PANE,
					renderer: editorRenderer,
				});
				layerGroup.addLayer(snapIndicator);
			} else {
				snapIndicator.setLatLng(latLng);
			}
		};

		const hideSnapIndicator = () => {
			if(snapIndicator) {
				layerGroup.removeLayer(snapIndicator);
				snapIndicator = undefined;
			}
		};

		const onMapClick = (e: LeafletMouseEvent) => {
			const d = drawing.value;
			if(!d || !currentMap.value || !currentWorld.value) return;

			const raw = currentMap.value.latLngToLocation(e.latlng, 64);
			const shift = !!e.originalEvent?.shiftKey;
			const point = applySnap(raw, shift);

			const marker = markers.value.find(m => m.id === d.id);
			if(!marker) {
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_DRAWING, undefined);
				return;
			}

			if(d.kind === 'area' || d.kind === 'line') {
				const m = marker as LocalEditorAreaMarker | LocalEditorLineMarker;
				const points = [...m.points, {x: point.x, y: m.points[0]?.y ?? 64, z: point.z}];
				store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
					id: d.id,
					patch: {points},
				});
			} else if(d.kind === 'circle-radius') {
				const m = marker as LocalEditorCircleMarker;
				const dx = Math.abs(point.x - m.center.x);
				const dz = Math.abs(point.z - m.center.z);
				const radiusX = Math.max(1, Math.round(dx));
				const radiusZ = Math.max(1, Math.round(dz));
				store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
					id: d.id,
					patch: {radiusX, radiusZ},
				});
				// Circle is one-and-done — exit drawing mode after the radius click
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_DRAWING, undefined);
			}
		};

		// Throttle mousemove handling to once per animation frame. Without
		// this, snap lookup + indicator update can run hundreds of times per
		// second during a drag.
		let pendingMoveFrame = 0;
		let lastMoveEvent: LeafletMouseEvent | null = null;

		const handleMouseMove = (e: LeafletMouseEvent) => {
			if(!drawing.value || !currentMap.value || !currentWorld.value) {
				hideSnapIndicator();
				return;
			}
			const raw = currentMap.value.latLngToLocation(e.latlng, 64);
			const shift = !!e.originalEvent?.shiftKey;
			if(!snapEnabled.value || shift) {
				hideSnapIndicator();
				return;
			}
			const targets = snapTargets.value;
			const drawingMarker = markers.value.find(mm => mm.id === drawing.value!.id);
			const filtered = drawingMarker && (drawingMarker.type === 'area' || drawingMarker.type === 'line')
				? targets.filter(t => !drawingMarker.points.includes(t))
				: targets;
			const snapped = findSnapTarget(raw, filtered);
			if(snapped) {
				updateSnapIndicator(currentMap.value.locationToLatLng(snapped));
			} else {
				hideSnapIndicator();
			}
		};

		const onMapMouseMove = (e: LeafletMouseEvent) => {
			lastMoveEvent = e;
			if(pendingMoveFrame) return;
			pendingMoveFrame = requestAnimationFrame(() => {
				pendingMoveFrame = 0;
				if(lastMoveEvent) handleMouseMove(lastMoveEvent);
			});
		};

		const onKeydown = (e: KeyboardEvent) => {
			if(e.key === 'Escape' && drawing.value) {
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_DRAWING, undefined);
			}
		};

		// Marker / selection changes drive the diff reconcile (no deep walk).
		watch([visibleMarkers, selectedId], reconcile);

		// Projection change → drop cached layers and rebuild from scratch.
		watch(currentMap, rebuildAll);

		// Attach the mousemove listener only while the user is drawing.
		watch(drawing, (newVal, oldVal) => {
			const willBeOn = !!newVal;
			const wasOn = !!oldVal;
			if(willBeOn && !wasOn) {
				props.leaflet.on('mousemove', onMapMouseMove);
			} else if(!willBeOn && wasOn) {
				props.leaflet.off('mousemove', onMapMouseMove);
				if(pendingMoveFrame) {
					cancelAnimationFrame(pendingMoveFrame);
					pendingMoveFrame = 0;
				}
				lastMoveEvent = null;
				hideSnapIndicator();
			}
		});

		onMounted(() => {
			// Ensure the editor pane exists before any layers reference it.
			// Set z-index above the marker panes (>= 401) so editor shapes
			// render on top of regular Dynmap markers.
			if(!props.leaflet.getPane(EDITOR_PANE)) {
				const pane = props.leaflet.createPane(EDITOR_PANE);
				pane.style.zIndex = '650';
			}
			props.leaflet.addLayer(layerGroup);
			props.leaflet.on('click', onMapClick);
			window.addEventListener('keydown', onKeydown);
			reconcile();
		});

		onUnmounted(() => {
			props.leaflet.removeLayer(layerGroup);
			props.leaflet.off('click', onMapClick);
			props.leaflet.off('mousemove', onMapMouseMove);
			window.removeEventListener('keydown', onKeydown);
			if(pendingMoveFrame) cancelAnimationFrame(pendingMoveFrame);
			layerCache.clear();
		});
	},

	render() {
		return null;
	},
});
</script>

<style lang="scss">
	.local-editor-tooltip {
		background-color: rgba(40, 40, 40, 0.85) !important;
		color: #fff !important;
		border: 1px solid #f6a623 !important;
		font-size: 1.2rem !important;
		font-weight: 500 !important;

		&::before {
			border-top-color: #f6a623 !important;
		}
	}
</style>
