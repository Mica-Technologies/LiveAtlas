<!--
  - Copyright 2026 LiveAtlas Contributors
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -->

<template>
	<div v-if="active" class="measure-overlay" role="region" aria-label="Distance measurement">
		<div class="measure-overlay__summary">
			<span class="measure-overlay__total">{{ totalLabel }}</span>
			<span class="measure-overlay__hint">{{ hint }}</span>
		</div>
		<button type="button" class="measure-overlay__button" @click="finish">Done</button>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, onUnmounted, ref} from "vue";
import {LatLng, LeafletMouseEvent, Polyline, CircleMarker} from "leaflet";
import {MeasureControl} from "@/leaflet/control/MeasureControl";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import {useStore} from "@/store";

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		}
	},

	setup(props) {
		const store = useStore();
		const active = ref(false);
		const points = ref<LatLng[]>([]);
		const totalBlocks = ref(0);
		let polyline: Polyline | null = null;
		const vertexMarkers: CircleMarker[] = [];

		const currentMap = computed(() => store.state.currentMap);

		const totalLabel = computed(() => {
			if(totalBlocks.value === 0) return 'Click to start';
			return `${Math.round(totalBlocks.value).toLocaleString()} blocks`;
		});

		const hint = computed(() => {
			if(points.value.length < 2) return 'Click points to measure (Esc to exit)';
			return `${points.value.length} points`;
		});

		// Sum planar (X/Z) distance between consecutive points in
		// Minecraft-block units. Y is ignored since the map projection
		// doesn't carry elevation reliably.
		const recomputeTotal = () => {
			const m = currentMap.value;
			if(!m) {
				totalBlocks.value = 0;
				return;
			}
			let sum = 0;
			for(let i = 1; i < points.value.length; i++) {
				const a = m.latLngToLocation(points.value[i - 1], 64);
				const b = m.latLngToLocation(points.value[i], 64);
				const dx = b.x - a.x;
				const dz = b.z - a.z;
				sum += Math.sqrt(dx * dx + dz * dz);
			}
			totalBlocks.value = sum;
		};

		const clearShapes = () => {
			if(polyline) {
				props.leaflet.removeLayer(polyline);
				polyline = null;
			}
			for(const v of vertexMarkers) {
				props.leaflet.removeLayer(v);
			}
			vertexMarkers.length = 0;
		};

		const redrawShapes = () => {
			if(polyline) {
				polyline.setLatLngs(points.value);
			} else if(points.value.length) {
				polyline = new Polyline(points.value, {
					color: '#ffd000',
					weight: 3,
					opacity: 0.85,
					dashArray: '6 6',
					interactive: false,
				});
				polyline.addTo(props.leaflet);
			}
		};

		const addVertex = (latlng: LatLng) => {
			const marker = new CircleMarker(latlng, {
				radius: 4,
				color: '#ffd000',
				weight: 2,
				fillColor: '#ffffff',
				fillOpacity: 1,
				interactive: false,
			});
			marker.addTo(props.leaflet);
			vertexMarkers.push(marker);
		};

		const onMapClick = (e: LeafletMouseEvent) => {
			if(!active.value) return;
			points.value.push(e.latlng);
			addVertex(e.latlng);
			redrawShapes();
			recomputeTotal();
		};

		const onKeydown = (e: KeyboardEvent) => {
			if(e.key === 'Escape' && active.value) {
				finish();
			}
		};

		const start = () => {
			active.value = true;
			points.value = [];
			totalBlocks.value = 0;
			control.setActive(true);
			props.leaflet.getContainer().classList.add('map--measuring');
			props.leaflet.on('click', onMapClick);
			window.addEventListener('keydown', onKeydown);
		};

		const finish = () => {
			active.value = false;
			control.setActive(false);
			props.leaflet.getContainer().classList.remove('map--measuring');
			props.leaflet.off('click', onMapClick);
			window.removeEventListener('keydown', onKeydown);
			clearShapes();
			points.value = [];
			totalBlocks.value = 0;
		};

		const toggle = () => active.value ? finish() : start();

		const control = new MeasureControl({
			position: 'topleft',
			onToggle: toggle,
		});

		onMounted(() => props.leaflet.addControl(control));
		onUnmounted(() => {
			if(active.value) finish();
			props.leaflet.removeControl(control);
		});

		return {
			active,
			totalLabel,
			hint,
			finish,
		};
	},
});
</script>

<style lang="scss" scoped>
	.measure-overlay {
		position: absolute;
		top: 1.2rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
		display: flex;
		align-items: center;
		gap: 1.2rem;
		padding: 0.6rem 1.2rem;
		background-color: var(--background-base);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius);
		box-shadow: var(--box-shadow);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		font-size: 1.4rem;
		color: var(--text-base);
		pointer-events: auto;
	}

	.measure-overlay__summary {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
	}

	.measure-overlay__total {
		font-size: 1.6rem;
		font-weight: 600;
	}

	.measure-overlay__hint {
		font-size: 1.2rem;
		color: var(--text-subtle);
	}

	.measure-overlay__button {
		padding: 0.4rem 1rem;
		background-color: var(--background-light);
		border: 1px solid var(--border-color);
		border-radius: 0.4rem;
		color: var(--text-base);
		cursor: pointer;

		&:hover {
			background-color: var(--background-base-solid);
		}
	}
</style>
