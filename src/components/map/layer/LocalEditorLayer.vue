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
import {computed, defineComponent, onMounted, onUnmounted, ref, watch} from "vue";
import {CircleMarker, DivIcon, LatLng, Layer, LayerGroup, LeafletMouseEvent, Marker, Path, SVG} from "leaflet";
import {useStore} from "@/store";
import {nonReactiveState} from "@/store/state";
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
	stripLiveAtlasIdPrefix,
} from "@/util/localEditor";
import {Coordinate, LiveAtlasMarker} from "@/index";
import LiveAtlasPolyline from "@/leaflet/vector/LiveAtlasPolyline";
import LiveAtlasPolygon from "@/leaflet/vector/LiveAtlasPolygon";
import {getCirclePoints} from "@/util/circles";
import {LiveAtlasAreaMarker, LiveAtlasCircleMarker, LiveAtlasLineMarker} from "@/index";
import {LiveAtlasMarkerType, registerUpdateHandler, unregisterUpdateHandler} from "@/util/markers";

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
// Dedicated pane for editor interaction handles (vertex drags, segment
// inserts, circle radius grips). Lives above EDITOR_PANE so handles draw
// over their shapes, and forces pointer-events:auto — the default
// tooltipPane (used briefly during early development) has
// pointer-events:none, which caused map-drag to win over handle-drag.
const EDITOR_HANDLE_PANE = 'local-editor-handles';

// Shared SVG renderer for every pending shape. SVG uses CSS transforms
// during pan/zoom (no per-frame redraw) — unlike the canvas renderer the
// rest of the map uses (preferCanvas: true). Keeps the editor's shapes
// off the shared-canvas redraw path during drags.
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
			picking = computed(() => store.state.localEditor.picking),
			snapEnabled = computed(() => store.state.localEditor.snapEnabled),
			showVertexNumbers = computed(() => store.state.localEditor.showVertexNumbers),
			layerGroup = new LayerGroup(),
			layerCache = new Map<string, CachedLayer>(),
			// Separate group for the small numeric vertex labels. Kept apart
			// from layerCache so its lifecycle doesn't tangle with shape diffing.
			vertexLabelGroup = new LayerGroup(),
			// Edit handles (drag-to-move vertices, click-segment-to-insert,
			// circle center/radius drags). Lifecycle is selection-driven —
			// only the currently-selected editable marker has handles.
			handleGroup = new LayerGroup();

		let snapIndicator: CircleMarker | undefined;

		const visibleMarkers = computed((): LocalEditorMarker[] => {
			if(!currentWorld.value) return [];
			return markers.value.filter(m => m.worldName === currentWorld.value!.name);
		});

		// Joined signature of every visible marker — the watch source below.
		// Reading markerSignature(m) inside this computed creates reactive
		// deps on every field the renderer cares about (label, style,
		// points, etc.), so editing any of them in the form re-triggers
		// reconcile without the cost of {deep: true} on the marker array.
		const visibleMarkersFingerprint = computed(() =>
			visibleMarkers.value.map(m => `${m.id}=${markerSignature(m)}`).join('|'));

		// Bumped whenever a streaming server-marker update lands, so
		// `snapTargets` (which reads from nonReactiveState, explicitly
		// non-reactive) can be invalidated. state.markerSets covers the
		// initial bulk load + add/remove of sets; this handles per-marker
		// updates within an existing set.
		const serverMarkersVersion = ref(0);
		const bumpServerMarkers = () => { serverMarkersVersion.value++; };

		const snapTargets = computed((): Coordinate[] => {
			if(!currentWorld.value) return [];
			// Touch the version ref so this computed re-runs after server
			// marker updates land.
			void serverMarkersVersion.value;

			// Suppress server markers that are mirrored as pending edits
			// or deletes: the local-editor copy is already a snap target
			// from the local-markers pass, so including the server
			// original would produce a stale duplicate.
			const suppressed = new Set<string>();
			for(const m of markers.value) {
				if(m.origin !== 'edit' && m.origin !== 'delete') continue;
				suppressed.add(`${m.originalSetId || m.setId}|${m.id}`);
			}

			const serverMarkers: LiveAtlasMarker[] = [];
			for(const [setId, set] of store.state.markerSets) {
				// Skip sets the user has hidden in the layer control;
				// snapping to invisible geometry would be confusing.
				const visibility = store.state.markerSetVisibility.get(setId);
				const isVisible = visibility !== undefined ? visibility : !set.hidden;
				if(!isVisible) continue;
				const setMarkers = nonReactiveState.markers.get(setId);
				if(!setMarkers) continue;
				for(const [markerId, marker] of setMarkers) {
					const unprefixed = stripLiveAtlasIdPrefix(markerId);
					if(suppressed.has(`${setId}|${unprefixed}`)) continue;
					serverMarkers.push(marker);
				}
			}

			return collectSnapTargets(markers.value, currentWorld.value.name, serverMarkers);
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
				// Don't steal clicks while drawing or while the eyedropper
				// is armed — both have their own click semantics.
				if(store.state.localEditor.drawing || store.state.localEditor.picking) return;
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
			reconcileVertexLabels();
		};

		// Whether the given marker should sprout numeric vertex labels.
		// Always on for the currently-selected area/line; otherwise gated
		// behind the global "Show vertex numbers" toggle.
		const shouldLabel = (m: LocalEditorMarker): boolean => {
			if(m.type !== 'area' && m.type !== 'line') return false;
			if(m.origin === 'delete') return false;
			if(showVertexNumbers.value) return true;
			return m.id === selectedId.value;
		};

		// Cheap clear-and-rebuild for the vertex labels. Cheaper than diffing
		// since they're DivIcons with negligible per-instance cost, and they
		// only update when selection, toggle, or geometry changes.
		const reconcileVertexLabels = () => {
			vertexLabelGroup.clearLayers();
			const map = currentMap.value;
			if(!map) return;
			for(const m of visibleMarkers.value) {
				if(!shouldLabel(m)) continue;
				if(m.type !== 'area' && m.type !== 'line') continue;
				const points = m.points;
				for(let i = 0; i < points.length; i++) {
					const latLng = map.locationToLatLng(points[i]);
					const icon = new DivIcon({
						className: 'local-editor-vertex-label',
						html: `<span>${i + 1}</span>`,
						iconSize: [18, 18],
						iconAnchor: [9, 9],
					});
					vertexLabelGroup.addLayer(new Marker(latLng, {
						icon,
						interactive: false,
						keyboard: false,
						pane: 'tooltipPane',
					}));
				}
			}
		};

		// While a handle is being dragged, suppress handle rebuilds — the
		// handle is being moved by the user; nuking it mid-drag would lose
		// the user's grip. The path layer is rebuilt independently from
		// geometry-fingerprint changes, so the shape still follows.
		let handleDragInFlight = false;

		const commitPointMove = (markerId: string, index: number, latLng: LatLng) => {
			const map = currentMap.value;
			if(!map) return;
			const current = markers.value.find(m => m.id === markerId);
			if(!current || (current.type !== 'area' && current.type !== 'line')) return;
			// Preserve the original Y; drags only change XZ.
			const oldY = current.points[index]?.y ?? 64;
			const newCoord = map.latLngToLocation(latLng, oldY);
			const updated = current.points.map((p, i) => i === index ? newCoord : p);
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
				id: markerId, patch: {points: updated},
			});
		};

		const commitCenterMove = (markerId: string, latLng: LatLng) => {
			const map = currentMap.value;
			if(!map) return;
			const current = markers.value.find(m => m.id === markerId);
			if(!current) return;
			const oldY = current.type === 'circle' ? current.center.y
				: current.type === 'point' ? current.location.y : 64;
			const newCoord = map.latLngToLocation(latLng, oldY);
			if(current.type === 'circle') {
				store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
					id: markerId, patch: {center: newCoord},
				});
			} else if(current.type === 'point') {
				store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
					id: markerId, patch: {location: newCoord},
				});
			}
		};

		const commitRadius = (markerId: string, axis: 'radiusX' | 'radiusZ', latLng: LatLng) => {
			const map = currentMap.value;
			if(!map) return;
			const current = markers.value.find(m => m.id === markerId);
			if(!current || current.type !== 'circle') return;
			const here = map.latLngToLocation(latLng, current.center.y);
			const next = Math.max(0, Math.round(axis === 'radiusX'
				? Math.abs(here.x - current.center.x)
				: Math.abs(here.z - current.center.z)));
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
				id: markerId, patch: {[axis]: next},
			});
		};

		const makeDraggableHandle = (latLng: LatLng, className: string,
				onDrag: (latLng: LatLng) => void, onDragEnd: () => void): Marker => {
			const handle = new Marker(latLng, {
				icon: new DivIcon({className, html: '', iconSize: [14, 14], iconAnchor: [7, 7]}),
				draggable: true,
				keyboard: false,
				autoPan: false,
				pane: EDITOR_HANDLE_PANE,
				// Mouse events must not bubble to the map — otherwise the map's
				// drag handler grabs the same mousedown that should start the
				// vertex drag.
				bubblingMouseEvents: false,
			});
			let dragFrame = 0;
			let lastLatLng: LatLng | null = null;
			const flush = () => {
				dragFrame = 0;
				if(lastLatLng) onDrag(lastLatLng);
			};
			handle.on('dragstart', () => { handleDragInFlight = true; });
			handle.on('drag', (e: any) => {
				lastLatLng = e.latlng;
				if(!dragFrame) dragFrame = requestAnimationFrame(flush);
			});
			handle.on('dragend', () => {
				if(dragFrame) {
					cancelAnimationFrame(dragFrame);
					dragFrame = 0;
				}
				if(lastLatLng) onDrag(lastLatLng);
				handleDragInFlight = false;
				onDragEnd();
			});
			return handle;
		};

		// Insert a vertex into an area/line at the midpoint of the segment
		// following `segmentIndex`. Areas wrap (last segment closes); lines
		// don't, so the caller must only emit midpoint handles for valid
		// segments.
		const insertVertexAt = (
			markerId: string, segmentIndex: number, mid: {x: number, y: number, z: number},
		) => {
			const current = markers.value.find(m => m.id === markerId);
			if(!current || (current.type !== 'area' && current.type !== 'line')) return;
			const updated = [...current.points];
			updated.splice(segmentIndex + 1, 0, mid);
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
				id: markerId, patch: {points: updated},
			});
		};

		// Cheap clear-and-rebuild for edit handles. Only fires when selection
		// changes, drawing/picking flips, or a drag finishes — NOT on every
		// path-geometry change, so an in-flight drag isn't disrupted.
		const reconcileHandles = () => {
			handleGroup.clearLayers();
			const map = currentMap.value;
			if(!map) return;
			if(drawing.value || picking.value) return;
			const selected = visibleMarkers.value.find(m => m.id === selectedId.value);
			if(!selected) return;
			if(selected.origin === 'delete') return;

			if(selected.type === 'area' || selected.type === 'line') {
				const points = selected.points;
				// Vertex drag handles
				for(let i = 0; i < points.length; i++) {
					const latLng = map.locationToLatLng(points[i]);
					const idx = i;
					const h = makeDraggableHandle(latLng, 'local-editor-vertex-handle',
						(ll) => commitPointMove(selected.id, idx, ll),
						() => reconcileHandles());
					handleGroup.addLayer(h);
				}
				// Segment midpoint "insert" handles. Areas have N segments
				// (wrap to close); lines have N-1.
				const segCount = selected.type === 'area' ? points.length : points.length - 1;
				for(let i = 0; i < segCount; i++) {
					const a = points[i];
					const b = points[(i + 1) % points.length];
					const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2};
					const latLng = map.locationToLatLng(mid);
					const icon = new DivIcon({
						className: 'local-editor-insert-handle',
						html: '+',
						iconSize: [12, 12], iconAnchor: [6, 6],
					});
					const handle = new Marker(latLng, {
						icon, keyboard: false, pane: EDITOR_HANDLE_PANE,
						bubblingMouseEvents: false,
					});
					const segIdx = i;
					handle.on('click', (e: LeafletMouseEvent) => {
						(e.originalEvent as MouseEvent | undefined)?.stopPropagation();
						insertVertexAt(selected.id, segIdx, mid);
						reconcileHandles();
					});
					handleGroup.addLayer(handle);
				}
			} else if(selected.type === 'circle') {
				const center = selected.center;
				const centerLL = map.locationToLatLng(center);
				handleGroup.addLayer(makeDraggableHandle(centerLL, 'local-editor-center-handle',
					(ll) => commitCenterMove(selected.id, ll),
					() => reconcileHandles()));
				// East and South radius handles, projected from the in-game
				// center along the X and Z axes respectively.
				const eastLL = map.locationToLatLng({
					x: center.x + selected.radiusX, y: center.y, z: center.z,
				});
				const southLL = map.locationToLatLng({
					x: center.x, y: center.y, z: center.z + selected.radiusZ,
				});
				handleGroup.addLayer(makeDraggableHandle(eastLL, 'local-editor-radius-handle',
					(ll) => commitRadius(selected.id, 'radiusX', ll),
					() => reconcileHandles()));
				handleGroup.addLayer(makeDraggableHandle(southLL, 'local-editor-radius-handle',
					(ll) => commitRadius(selected.id, 'radiusZ', ll),
					() => reconcileHandles()));
			}
			// Point markers keep their existing icon drag interaction via the
			// form fields — adding a second handle on top of the icon would
			// just visually overlap with the marker itself.
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
			// Picking mode: a click that didn't hit a path lands on the map.
			// Treat that as a cancel rather than seeding a vertex.
			if(picking.value) {
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
				return;
			}

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
			if(e.key === 'Escape') {
				if(picking.value) {
					store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
				} else if(drawing.value) {
					store.commit(MutationTypes.LOCAL_EDITOR_FINISH_DRAWING, undefined);
				}
			}
		};

		// --- Color sampling (eyedropper) ---
		// When picking mode is active, every Path layer on the map (Dynmap
		// areas/lines/circles as well as our own pending shapes) gets a
		// one-shot click handler that copies its color + opacity onto the
		// marker being edited.

		const pickHandlers = new Map<Path, (e: LeafletMouseEvent) => void>();

		const collectPaths = (): Path[] => {
			const out: Path[] = [];
			const visit = (layer: any) => {
				if(layer === snapIndicator) return;
				if(layer instanceof Path) {
					out.push(layer);
				} else if(typeof layer.eachLayer === 'function') {
					layer.eachLayer(visit);
				}
			};
			props.leaflet.eachLayer(visit);
			return out;
		};

		const samplePath = (layer: Path) => {
			const p = picking.value;
			if(!p) return;

			const opts = (layer as any).options || {};
			let patch: Record<string, unknown> = {};

			if(p.target === 'line') {
				const color = typeof opts.color === 'string' ? opts.color : undefined;
				const opacity = typeof opts.opacity === 'number' ? opts.opacity : undefined;
				if(color) patch = {...patch, lineColor: color};
				if(opacity !== undefined) patch = {...patch, lineOpacity: opacity};
			} else {
				const color = typeof opts.fillColor === 'string' ? opts.fillColor
					: (typeof opts.color === 'string' ? opts.color : undefined);
				const opacity = typeof opts.fillOpacity === 'number' ? opts.fillOpacity : undefined;
				if(color) patch = {...patch, fillColor: color};
				if(opacity !== undefined) patch = {...patch, fillOpacity: opacity};
			}

			if(!Object.keys(patch).length) {
				// Layer has no usable color (e.g. an unstyled CircleMarker).
				// Cancel picking rather than silently doing nothing.
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
				return;
			}

			const marker = markers.value.find(m => m.id === p.markerId);
			if(!marker || !('style' in marker)) {
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
				return;
			}

			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
				id: p.markerId,
				patch: {style: {...marker.style, ...patch}},
			});
			store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
		};

		const attachPickHandlers = () => {
			const paths = collectPaths();
			for(const path of paths) {
				const handler = (e: LeafletMouseEvent) => {
					e.originalEvent?.stopPropagation?.();
					samplePath(path);
				};
				pickHandlers.set(path, handler);
				path.on('click', handler);
			}
			document.body.classList.add('local-editor-picking');
		};

		const detachPickHandlers = () => {
			for(const [path, handler] of pickHandlers) {
				path.off('click', handler);
			}
			pickHandlers.clear();
			document.body.classList.remove('local-editor-picking');
		};

		// Marker / selection changes drive the diff reconcile. The fingerprint
		// covers add/remove plus any per-marker property the renderer reads.
		watch([visibleMarkersFingerprint, selectedId], () => {
			reconcile();
			reconcileVertexLabels();
			// Handle rebuilds are skipped during an in-flight drag — the drag
			// mutates marker points each AF tick, and rebuilding handles
			// would yank the one the user is gripping. dragend triggers an
			// explicit reconcileHandles to catch up.
			if(handleDragInFlight) return;
			reconcileHandles();
		});

		// Toggle changes for vertex numbers don't affect shapes, just labels.
		watch(showVertexNumbers, reconcileVertexLabels);

		// Handles disappear while drawing or picking is active — those modes
		// have their own map-click semantics that the handles would conflict
		// with.
		watch([drawing, picking], reconcileHandles);

		// Projection change → drop cached layers and rebuild from scratch.
		watch(currentMap, rebuildAll);

		// Attach pick click handlers only while picking is active.
		watch(picking, (newVal, oldVal) => {
			const willBeOn = !!newVal;
			const wasOn = !!oldVal;
			if(willBeOn && !wasOn) {
				attachPickHandlers();
			} else if(!willBeOn && wasOn) {
				detachPickHandlers();
			}
		});

		// Attach the mousemove listener only while the user is drawing.
		// Also flag the body so CSS can hide map tooltips during drawing:
		// server-marker tooltips use sticky:true, so they follow the cursor
		// and sit right under where the user is trying to click the next
		// vertex, making placement awkward.
		watch(drawing, (newVal, oldVal) => {
			const willBeOn = !!newVal;
			const wasOn = !!oldVal;
			if(willBeOn && !wasOn) {
				props.leaflet.on('mousemove', onMapMouseMove);
				document.body.classList.add('local-editor-drawing');
			} else if(!willBeOn && wasOn) {
				props.leaflet.off('mousemove', onMapMouseMove);
				document.body.classList.remove('local-editor-drawing');
				if(pendingMoveFrame) {
					cancelAnimationFrame(pendingMoveFrame);
					pendingMoveFrame = 0;
				}
				lastMoveEvent = null;
				hideSnapIndicator();
			}
		});

		// Passive hover-location tracker — publishes the cursor's in-game
		// coords to the store so the editor panel can show them (the panel
		// covers the bottom-left CoordinatesControl). Throttled via AF so a
		// fast mousemove doesn't thrash reactivity.
		let hoverFrame = 0;
		let lastHoverEvent: LeafletMouseEvent | null = null;
		const publishHover = () => {
			hoverFrame = 0;
			if(!lastHoverEvent || !currentMap.value || !currentWorld.value) return;
			const loc = currentMap.value.latLngToLocation(
				lastHoverEvent.latlng, currentWorld.value.seaLevel + 1);
			store.commit(MutationTypes.LOCAL_EDITOR_SET_HOVER_LOCATION, loc);
		};
		const onHoverMove = (e: LeafletMouseEvent) => {
			// Skip work when the editor panel is closed — nothing reads
			// hoverLocation in that state.
			if(!store.state.localEditor.active) return;
			lastHoverEvent = e;
			if(!hoverFrame) hoverFrame = requestAnimationFrame(publishHover);
		};
		const onHoverOut = () => {
			lastHoverEvent = null;
			if(hoverFrame) {
				cancelAnimationFrame(hoverFrame);
				hoverFrame = 0;
			}
			store.commit(MutationTypes.LOCAL_EDITOR_SET_HOVER_LOCATION, undefined);
		};

		onMounted(() => {
			// Ensure the editor pane exists before any layers reference it.
			// Z-index 650 puts editor shapes above the regular marker panes
			// (default 400-600) but at the same level as tooltips — fine
			// since tooltips don't overlap the shapes most of the time.
			if(!props.leaflet.getPane(EDITOR_PANE)) {
				const pane = props.leaflet.createPane(EDITOR_PANE);
				pane.style.zIndex = '650';
			}
			if(!props.leaflet.getPane(EDITOR_HANDLE_PANE)) {
				const pane = props.leaflet.createPane(EDITOR_HANDLE_PANE);
				pane.style.zIndex = '660';
				// Critical: default Leaflet panes near this z-index (tooltip,
				// popup) disable pointer events. Force them back on so the
				// handles can capture mousedown and start drags before the
				// map-drag handler claims the event.
				pane.style.pointerEvents = 'auto';
			}
			props.leaflet.addLayer(layerGroup);
			props.leaflet.addLayer(vertexLabelGroup);
			props.leaflet.addLayer(handleGroup);
			props.leaflet.on('click', onMapClick);
			props.leaflet.on('mousemove', onHoverMove);
			props.leaflet.on('mouseout', onHoverOut);
			window.addEventListener('keydown', onKeydown);
			registerUpdateHandler(bumpServerMarkers);
			reconcile();
			reconcileVertexLabels();
			reconcileHandles();
		});

		onUnmounted(() => {
			detachPickHandlers();
			props.leaflet.removeLayer(layerGroup);
			props.leaflet.removeLayer(vertexLabelGroup);
			props.leaflet.removeLayer(handleGroup);
			props.leaflet.off('click', onMapClick);
			props.leaflet.off('mousemove', onMapMouseMove);
			props.leaflet.off('mousemove', onHoverMove);
			props.leaflet.off('mouseout', onHoverOut);
			window.removeEventListener('keydown', onKeydown);
			unregisterUpdateHandler(bumpServerMarkers);
			document.body.classList.remove('local-editor-drawing');
			if(pendingMoveFrame) cancelAnimationFrame(pendingMoveFrame);
			if(hoverFrame) cancelAnimationFrame(hoverFrame);
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

	// Small numeric labels rendered at each vertex of a selected (or all,
	// when toggled) area/line, so the user can cross-reference the form's
	// vertex list with the shape on the map.
	.local-editor-vertex-label {
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		background: rgba(20, 20, 20, 0.85);
		color: #f6a623;
		border: 1px solid #f6a623;
		border-radius: 50%;
		font-size: 1.05rem;
		font-weight: 700;
		font-family: monospace;
		line-height: 1;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);

		span {
			padding: 0 0.1rem;
		}
	}

	// Crosshair cursor while the eyedropper is armed so the user knows
	// the next click on a marker will sample its colour.
	body.local-editor-picking,
	body.local-editor-picking .leaflet-container {
		cursor: crosshair !important;
	}

	// While drawing a new vertex-based shape, hide all Leaflet tooltips on
	// the map. Server-marker tooltips use sticky:true so they trail the
	// cursor; that puts a translucent bubble exactly where the user is
	// trying to drop the next vertex, making aiming awkward. DivIcon-based
	// vertex labels (which live in tooltipPane but use a different class)
	// are unaffected.
	body.local-editor-drawing .leaflet-tooltip {
		display: none !important;
	}

	// Drag-to-move vertex handles on the selected area/line. Filled square
	// so they read distinct from the numeric labels.
	.local-editor-vertex-handle {
		background: #f6a623;
		border: 2px solid #1d1d1d;
		border-radius: 2px;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
		cursor: grab;

		&:active {
			cursor: grabbing;
		}
	}

	// Click-to-insert handles at each segment midpoint. Smaller and dimmer
	// than the vertex handles, with a + glyph to suggest the action.
	.local-editor-insert-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(40, 40, 40, 0.85);
		color: #f6a623;
		border: 1px dashed #f6a623;
		border-radius: 50%;
		font-family: monospace;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		user-select: none;

		&:hover {
			background: rgba(246, 166, 35, 0.3);
			color: #fff;
		}
	}

	// Center handle for circle/point: round, brighter than vertex handles.
	.local-editor-center-handle {
		background: #fff;
		border: 2px solid #f6a623;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
		cursor: grab;

		&:active {
			cursor: grabbing;
		}
	}

	// Circle radius handles — distinguish from the center handle so it's
	// obvious which one resizes vs. moves.
	.local-editor-radius-handle {
		background: rgba(246, 166, 35, 0.6);
		border: 2px solid #1d1d1d;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
		cursor: ew-resize;
	}
</style>
