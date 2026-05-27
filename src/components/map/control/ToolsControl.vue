<!--
  - Copyright 2026 LiveAtlas Contributors
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -->

<script lang="ts">
import {defineComponent, onMounted, onUnmounted, ref, watch} from "vue";
import {LatLng, LeafletMouseEvent, Polyline, CircleMarker} from "leaflet";
import {ToolsControl} from "@/leaflet/control/ToolsControl";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {LiveAtlasLocation} from "@/index";

const parseCoords = (raw: string): LiveAtlasLocation | null => {
	const matches = raw.match(/-?\d+(?:\.\d+)?/g);
	if(!matches) return null;
	const nums = matches.map(Number).filter(n => !Number.isNaN(n));
	if(nums.length === 2) return {x: nums[0], y: 64, z: nums[1]};
	if(nums.length === 3) return {x: nums[0], y: nums[1], z: nums[2]};
	return null;
};

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		}
	},

	setup(props) {
		const store = useStore();
		const expanded = ref(false);

		const measureActive = ref(false);
		const measurePoints: LatLng[] = [];
		let measurePolyline: Polyline | null = null;
		const measureVertices: CircleMarker[] = [];

		const formatMeasureStatus = () => {
			let total = 0;
			const map = store.state.currentMap;
			if(map) {
				for(let i = 1; i < measurePoints.length; i++) {
					const a = map.latLngToLocation(measurePoints[i - 1], 64);
					const b = map.latLngToLocation(measurePoints[i], 64);
					const dx = b.x - a.x;
					const dz = b.z - a.z;
					total += Math.sqrt(dx * dx + dz * dz);
				}
			}
			const totalText = measurePoints.length < 2
				? 'Click to start'
				: `${Math.round(total).toLocaleString()} blocks`;
			const hint = measurePoints.length < 2
				? 'Click points (Esc to exit)'
				: `${measurePoints.length} points`;
			control.setMeasureStatus(totalText, hint);
		};

		const clearMeasureShapes = () => {
			if(measurePolyline) {
				props.leaflet.removeLayer(measurePolyline);
				measurePolyline = null;
			}
			for(const v of measureVertices) props.leaflet.removeLayer(v);
			measureVertices.length = 0;
		};

		const onMapClick = (e: LeafletMouseEvent) => {
			if(!measureActive.value) return;
			measurePoints.push(e.latlng);
			const vertex = new CircleMarker(e.latlng, {
				radius: 4,
				color: '#ffd000',
				weight: 2,
				fillColor: '#ffffff',
				fillOpacity: 1,
				interactive: false,
			});
			vertex.addTo(props.leaflet);
			measureVertices.push(vertex);
			if(measurePolyline) {
				measurePolyline.setLatLngs(measurePoints);
			} else {
				measurePolyline = new Polyline(measurePoints, {
					color: '#ffd000',
					weight: 3,
					opacity: 0.85,
					dashArray: '6 6',
					interactive: false,
				});
				measurePolyline.addTo(props.leaflet);
			}
			formatMeasureStatus();
		};

		const onKeydown = (e: KeyboardEvent) => {
			if(e.key === 'Escape' && measureActive.value) stopMeasure();
		};

		const startMeasure = () => {
			measureActive.value = true;
			measurePoints.length = 0;
			props.leaflet.getContainer().classList.add('map--measuring');
			props.leaflet.on('click', onMapClick);
			window.addEventListener('keydown', onKeydown);
			formatMeasureStatus();
		};

		const stopMeasure = () => {
			measureActive.value = false;
			props.leaflet.getContainer().classList.remove('map--measuring');
			props.leaflet.off('click', onMapClick);
			window.removeEventListener('keydown', onKeydown);
			clearMeasureShapes();
			measurePoints.length = 0;
		};

		const control = new ToolsControl({
			position: 'bottomleft',
			onToggleExpanded: () => expanded.value = !expanded.value,
			onGotoSubmit: (raw) => {
				const location = parseCoords(raw);
				if(!location) {
					control.flashGotoInvalid();
					return;
				}
				store.commit(MutationTypes.SET_VIEW_TARGET, {location});
				control.clearGotoInput();
			},
			onMeasureToggle: () => measureActive.value ? stopMeasure() : startMeasure(),
		});

		watch(expanded, v => control.setExpanded(v));
		watch(measureActive, v => control.setMeasureActive(v));

		onMounted(() => props.leaflet.addControl(control));
		onUnmounted(() => {
			if(measureActive.value) stopMeasure();
			props.leaflet.removeControl(control);
		});
	},

	render() {
		return null;
	},
});
</script>
