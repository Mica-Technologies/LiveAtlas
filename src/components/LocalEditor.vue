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
	<aside v-if="active" class="local-editor" role="complementary" aria-label="Local marker editor">
		<header class="local-editor__header">
			<h2 class="local-editor__title">Local Editor</h2>
			<v-btn icon variant="text" size="small" title="Close editor" @click="close">
				<SvgIcon name="cross" />
			</v-btn>
		</header>

		<div v-if="drawing" class="local-editor__drawing-bar">
			<span class="local-editor__drawing-status">
				<span class="local-editor__drawing-pulse"></span>
				<template v-if="drawing.kind === 'circle-radius'">
					Click on the map to set the circle radius
				</template>
				<template v-else>
					Click to add a vertex (Shift to skip snap)
				</template>
			</span>
			<v-btn variant="flat" color="primary" size="small" @click="finishDrawing">Finish</v-btn>
		</div>
		<p v-else class="local-editor__hint">
			<strong>Tip:</strong> right-click on the map to add a marker. Your work stays
			in this browser until you generate commands.
		</p>

		<label class="local-editor__snap-toggle">
			<v-checkbox-btn :model-value="snapEnabled" @update:model-value="setSnap" density="compact" hide-details />
			<span>Snap to nearby vertices</span>
		</label>

		<LocalEditorSets />

		<section class="local-editor__list" aria-label="Pending markers">
			<div v-if="!markers.length" class="local-editor__empty">No pending markers yet.</div>
			<button v-for="marker in markers" :key="marker.id" type="button"
				class="local-editor__list-item"
				:class="{ 'local-editor__list-item--selected': marker.id === selectedId,
					'local-editor__list-item--other-world': marker.worldName !== currentWorldName }"
				@click="select(marker.id)">
				<span class="local-editor__list-label">
					<span class="local-editor__type-badge" :data-type="marker.type">{{ marker.type }}</span>
					{{ marker.label || marker.id }}
				</span>
				<span class="local-editor__list-meta">{{ markerSummary(marker) }}</span>
			</button>
		</section>

		<section v-if="selected" class="local-editor__form">
			<v-text-field label="Label" density="compact" variant="outlined" hide-details
				:model-value="selected.label" @update:model-value="updateField('label', $event)" />

			<v-combobox label="Marker set" density="compact" variant="outlined" hide-details
				:items="setOptions" :model-value="selected.setId"
				@update:model-value="updateField('setId', $event)" />

			<!-- Point-only fields -->
			<template v-if="selected.type === 'point'">
				<v-combobox label="Icon ID" density="compact" variant="outlined" hide-details
					:items="iconOptions" :model-value="selected.iconId"
					@update:model-value="updateField('iconId', $event)" />

				<div class="local-editor__coords">
					<v-text-field label="X" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.location.x"
						@update:model-value="updateLocation('location', 'x', $event)" />
					<v-text-field label="Y" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.location.y"
						@update:model-value="updateLocation('location', 'y', $event)" />
					<v-text-field label="Z" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.location.z"
						@update:model-value="updateLocation('location', 'z', $event)" />
				</div>
			</template>

			<!-- Circle-only fields -->
			<template v-else-if="selected.type === 'circle'">
				<div class="local-editor__coords">
					<v-text-field label="X" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.center.x"
						@update:model-value="updateLocation('center', 'x', $event)" />
					<v-text-field label="Y" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.center.y"
						@update:model-value="updateLocation('center', 'y', $event)" />
					<v-text-field label="Z" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.center.z"
						@update:model-value="updateLocation('center', 'z', $event)" />
				</div>
				<div class="local-editor__coords local-editor__coords--two">
					<v-text-field label="Radius X" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.radiusX"
						@update:model-value="updateNumberField('radiusX', $event)" />
					<v-text-field label="Radius Z" type="number" density="compact" variant="outlined" hide-details
						:model-value="selected.radiusZ"
						@update:model-value="updateNumberField('radiusZ', $event)" />
				</div>
			</template>

			<!-- Area / line shared point editor -->
			<template v-else-if="selected.type === 'area' || selected.type === 'line'">
				<div class="local-editor__points">
					<div class="local-editor__points-header">
						<span>Vertices ({{ selected.points.length }})</span>
						<v-btn size="x-small" variant="text" @click="addVertex">+ Add vertex</v-btn>
					</div>
					<div v-for="(p, idx) in selected.points" :key="idx" class="local-editor__point-row">
						<span class="local-editor__point-index">{{ idx + 1 }}</span>
						<v-text-field label="X" type="number" density="compact" variant="outlined" hide-details
							:model-value="p.x" @update:model-value="updateVertex(idx, 'x', $event)" />
						<v-text-field label="Y" type="number" density="compact" variant="outlined" hide-details
							:model-value="p.y" @update:model-value="updateVertex(idx, 'y', $event)" />
						<v-text-field label="Z" type="number" density="compact" variant="outlined" hide-details
							:model-value="p.z" @update:model-value="updateVertex(idx, 'z', $event)" />
						<v-btn size="x-small" icon variant="text" :disabled="selected.points.length <= minVertices"
							@click="removeVertex(idx)">
							<SvgIcon name="cross" />
						</v-btn>
					</div>
				</div>
			</template>

			<!-- Style fields for path types -->
			<template v-if="hasStyle">
				<details class="local-editor__style">
					<summary>Style</summary>
					<div class="local-editor__style-grid">
						<v-text-field label="Line color" density="compact" variant="outlined" hide-details
							:model-value="(selected as any).style.lineColor"
							@update:model-value="updateStyle('lineColor', $event)" />
						<v-text-field label="Line opacity" type="number" density="compact" variant="outlined" hide-details
							:model-value="(selected as any).style.lineOpacity" min="0" max="1" step="0.05"
							@update:model-value="updateStyleNumber('lineOpacity', $event)" />
						<v-text-field label="Line weight" type="number" density="compact" variant="outlined" hide-details
							:model-value="(selected as any).style.lineWeight" min="1" step="1"
							@update:model-value="updateStyleNumber('lineWeight', $event)" />
						<template v-if="selected.type !== 'line'">
							<v-text-field label="Fill color" density="compact" variant="outlined" hide-details
								:model-value="(selected as any).style.fillColor"
								@update:model-value="updateStyle('fillColor', $event)" />
							<v-text-field label="Fill opacity" type="number" density="compact" variant="outlined" hide-details
								:model-value="(selected as any).style.fillOpacity" min="0" max="1" step="0.05"
								@update:model-value="updateStyleNumber('fillOpacity', $event)" />
						</template>
					</div>
				</details>
			</template>

			<v-textarea label="Description (optional)" density="compact" variant="outlined" hide-details
				rows="2" auto-grow :model-value="selected.description || ''"
				@update:model-value="updateField('description', $event)" />

			<div class="local-editor__form-actions">
				<v-btn variant="text" size="small" @click="panToSelected">Pan to marker</v-btn>
				<v-btn variant="text" size="small" color="error" @click="deleteSelected">Delete</v-btn>
			</div>
		</section>

		<footer class="local-editor__footer">
			<v-btn variant="tonal" size="small" :disabled="!markers.length" @click="persist">
				Save to browser
			</v-btn>
			<v-btn variant="flat" color="primary" size="small" :disabled="!markers.length" @click="showCommands">
				Get commands…
			</v-btn>
		</footer>
	</aside>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {
	DEFAULT_ICON_IDS,
	LocalEditorAreaMarker,
	LocalEditorCircleMarker,
	LocalEditorLineMarker,
	LocalEditorMarker,
	LocalEditorPointMarker,
	PathStyle,
} from "@/util/localEditor";
import {Coordinate} from "@/index";
import SvgIcon from "@/components/SvgIcon.vue";
import LocalEditorSets from "@/components/LocalEditorSets.vue";
import {notify} from "@kyvg/vue3-notification";

const toNum = (value: string | number): number | undefined => {
	const num = typeof value === 'string' ? parseFloat(value) : value;
	return Number.isNaN(num) ? undefined : num;
};

const markerCenter = (m: LocalEditorMarker): Coordinate => {
	switch(m.type) {
		case 'point':  return m.location;
		case 'circle': return m.center;
		case 'area':
		case 'line':   return m.points[0] || {x: 0, y: 64, z: 0};
	}
};

export default defineComponent({
	name: 'LocalEditor',
	components: {SvgIcon, LocalEditorSets},

	setup() {
		const store = useStore(),
			active = computed(() => store.state.localEditor.active),
			markers = computed(() => store.state.localEditor.markers),
			selectedId = computed(() => store.state.localEditor.selectedId),
			selected = computed(() => markers.value.find(m => m.id === selectedId.value)),
			currentWorldName = computed(() => store.state.currentWorld?.name),
			markerSets = computed(() => store.state.markerSets),
			drawing = computed(() => store.state.localEditor.drawing),
			snapEnabled = computed(() => store.state.localEditor.snapEnabled);

		const setOptions = computed(() => {
			const opts = new Set<string>();
			markerSets.value.forEach((_set, id) => opts.add(id));
			store.state.localEditor.sets.forEach(s => opts.add(s.id));
			return Array.from(opts).sort();
		});

		const iconOptions = [...DEFAULT_ICON_IDS].sort();

		const hasStyle = computed(() => {
			const t = selected.value?.type;
			return t === 'area' || t === 'line' || t === 'circle';
		});

		const minVertices = computed(() => selected.value?.type === 'area' ? 3 : 2);

		const markerSummary = (m: LocalEditorMarker): string => {
			const c = markerCenter(m);
			const xyz = `${Math.round(c.x)}, ${Math.round(c.y)}, ${Math.round(c.z)}`;
			switch(m.type) {
				case 'point':  return `${m.worldName} · ${xyz}`;
				case 'circle': return `${m.worldName} · ${xyz} · r=${Math.round(m.radiusX)}/${Math.round(m.radiusZ)}`;
				case 'area':   return `${m.worldName} · ${m.points.length} verts`;
				case 'line':   return `${m.worldName} · ${m.points.length} verts`;
			}
		};

		const close = () => store.commit(MutationTypes.LOCAL_EDITOR_SET_ACTIVE, false);
		const select = (id: string) => store.commit(MutationTypes.LOCAL_EDITOR_SELECT_MARKER, id);

		const commitPatch = (patch: Partial<LocalEditorMarker>) => {
			if(!selectedId.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {id: selectedId.value, patch});
		};

		const updateField = (key: string, value: unknown) => {
			commitPatch({[key]: value} as Partial<LocalEditorMarker>);
		};

		const updateNumberField = (key: string, value: string | number) => {
			const num = toNum(value);
			if(num === undefined) return;
			commitPatch({[key]: num} as Partial<LocalEditorMarker>);
		};

		const updateLocation = (key: 'location' | 'center', axis: 'x' | 'y' | 'z', value: string | number) => {
			const m = selected.value;
			if(!m) return;
			const num = toNum(value);
			if(num === undefined) return;
			const current = key === 'location'
				? (m as LocalEditorPointMarker).location
				: (m as LocalEditorCircleMarker).center;
			commitPatch({[key]: {...current, [axis]: num}} as Partial<LocalEditorMarker>);
		};

		const updateVertex = (index: number, axis: 'x' | 'y' | 'z', value: string | number) => {
			const m = selected.value as LocalEditorAreaMarker | LocalEditorLineMarker | undefined;
			if(!m || !('points' in m)) return;
			const num = toNum(value);
			if(num === undefined) return;
			const points = m.points.map((p, i) => i === index ? {...p, [axis]: num} : p);
			commitPatch({points} as Partial<LocalEditorMarker>);
		};

		const addVertex = () => {
			const m = selected.value as LocalEditorAreaMarker | LocalEditorLineMarker | undefined;
			if(!m || !('points' in m)) return;
			const last = m.points[m.points.length - 1] || {x: 0, y: 64, z: 0};
			const points = [...m.points, {x: last.x + 5, y: last.y, z: last.z + 5}];
			commitPatch({points} as Partial<LocalEditorMarker>);
		};

		const removeVertex = (index: number) => {
			const m = selected.value as LocalEditorAreaMarker | LocalEditorLineMarker | undefined;
			if(!m || !('points' in m)) return;
			if(m.points.length <= minVertices.value) return;
			const points = m.points.filter((_, i) => i !== index);
			commitPatch({points} as Partial<LocalEditorMarker>);
		};

		const updateStyle = (key: keyof PathStyle, value: unknown) => {
			const m = selected.value;
			if(!m || !('style' in m)) return;
			commitPatch({style: {...m.style, [key]: value}} as Partial<LocalEditorMarker>);
		};

		const updateStyleNumber = (key: keyof PathStyle, value: string | number) => {
			const num = toNum(value);
			if(num === undefined) return;
			updateStyle(key, num);
		};

		const deleteSelected = () => {
			if(!selectedId.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_DELETE_MARKER, selectedId.value);
		};

		const panToSelected = () => {
			if(!selected.value || !store.state.currentMap) return;
			if(selected.value.worldName !== currentWorldName.value) {
				notify({type: 'warn', text: 'Marker is in a different world'});
				return;
			}
			store.commit(MutationTypes.SET_VIEW_TARGET, {
				location: markerCenter(selected.value),
			});
		};

		const persist = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_PERSIST, undefined);
			notify({type: 'success', text: `Saved ${markers.value.length} marker(s) to this browser`});
		};

		const showCommands = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL, true);
		};

		const finishDrawing = () => {
			store.commit(MutationTypes.LOCAL_EDITOR_FINISH_DRAWING, undefined);
		};

		const setSnap = (enabled: boolean) => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_SNAP, enabled);
		};

		return {
			active,
			markers,
			selected,
			selectedId,
			currentWorldName,
			setOptions,
			iconOptions,
			hasStyle,
			minVertices,
			markerSummary,
			drawing,
			snapEnabled,

			close,
			select,
			updateField,
			updateNumberField,
			updateLocation,
			updateVertex,
			addVertex,
			removeVertex,
			updateStyle,
			updateStyleNumber,
			deleteSelected,
			panToSelected,
			persist,
			showCommands,
			finishDrawing,
			setSnap,
		};
	},
});
</script>

<style lang="scss">
	.local-editor {
		position: fixed;
		top: var(--ui-element-spacing);
		left: var(--ui-element-spacing);
		bottom: var(--ui-element-spacing);
		width: 34rem;
		max-width: calc(100vw - 2 * var(--ui-element-spacing));
		z-index: 120;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background-color: var(--background-base);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		border: 1px solid var(--border-color);
		border-left: 3px solid #f6a623;
		border-radius: var(--border-radius);
		box-shadow: var(--box-shadow);
		color: var(--text-base);
		font-size: 1.4rem;
		overflow: hidden;
		pointer-events: auto;

		&__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-shrink: 0;
		}

		&__title {
			margin: 0;
			font-size: 1.8rem;
			font-weight: 500;
		}

		&__hint {
			margin: 0;
			padding: 0.8rem 1rem;
			background-color: rgba(246, 166, 35, 0.1);
			border-left: 2px solid #f6a623;
			border-radius: 0.3rem;
			font-size: 1.3rem;
			line-height: 1.4;
			color: var(--text-subtle);

			strong {
				color: var(--text-base);
			}
		}

		&__drawing-bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.8rem;
			padding: 0.6rem 1rem;
			background-color: rgba(34, 204, 136, 0.15);
			border-left: 2px solid #22cc88;
			border-radius: 0.3rem;
			font-size: 1.3rem;
		}

		&__drawing-status {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			color: var(--text-base);
		}

		&__drawing-pulse {
			width: 1rem;
			height: 1rem;
			border-radius: 50%;
			background-color: #22cc88;
			box-shadow: 0 0 0 0 rgba(34, 204, 136, 0.5);
			animation: local-editor-pulse 1.5s infinite;
		}

		&__snap-toggle {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			font-size: 1.3rem;
			cursor: pointer;
			color: var(--text-subtle);
			user-select: none;
		}

		&__list {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
			overflow-y: auto;
			flex-shrink: 1;
			min-height: 6rem;
			max-height: 22rem;
		}

		&__empty {
			font-style: italic;
			color: var(--text-disabled);
			text-align: center;
			padding: 1rem 0;
		}

		&__list-item {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 0.2rem;
			padding: 0.6rem 1rem;
			background-color: var(--background-light);
			border: 1px solid transparent;
			border-radius: 0.4rem;
			color: inherit;
			cursor: pointer;
			text-align: left;

			&--selected {
				border-color: #f6a623;
				background-color: rgba(246, 166, 35, 0.15);
			}

			&--other-world {
				opacity: 0.6;
			}
		}

		&__list-label {
			font-weight: 500;
			font-size: 1.4rem;
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		&__type-badge {
			display: inline-block;
			padding: 0.1rem 0.5rem;
			font-size: 1rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			border-radius: 0.25rem;
			background-color: rgba(246, 166, 35, 0.25);
			color: #f6a623;

			&[data-type=area]   { background-color: rgba(120, 180, 255, 0.2); color: #78b4ff; }
			&[data-type=line]   { background-color: rgba(120, 220, 140, 0.2); color: #78dc8c; }
			&[data-type=circle] { background-color: rgba(220, 120, 220, 0.2); color: #dc78dc; }
		}

		&__list-meta {
			font-family: monospace;
			font-size: 1.2rem;
			color: var(--text-subtle);
		}

		&__form {
			display: flex;
			flex-direction: column;
			gap: 0.8rem;
			flex-shrink: 1;
			padding-top: 0.5rem;
			border-top: 1px solid var(--border-color);
			overflow-y: auto;
			min-height: 0;
		}

		&__coords {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;

			&--two {
				grid-template-columns: repeat(2, 1fr);
			}
		}

		&__points {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
		}

		&__points-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			font-size: 1.3rem;
			color: var(--text-subtle);
		}

		&__point-row {
			display: grid;
			grid-template-columns: 1.5rem repeat(3, 1fr) auto;
			gap: 0.3rem;
			align-items: center;
		}

		&__point-index {
			font-family: monospace;
			font-size: 1.1rem;
			color: var(--text-subtle);
		}

		&__style {
			summary {
				cursor: pointer;
				padding: 0.3rem 0;
				font-size: 1.3rem;
				color: var(--text-subtle);
				user-select: none;
			}
		}

		&__style-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 0.5rem;
			padding-top: 0.5rem;
		}

		&__form-actions {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
		}

		&__footer {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			padding-top: 0.5rem;
			border-top: 1px solid var(--border-color);
			flex-shrink: 0;
		}

		@media (max-width: 600px) {
			top: auto;
			left: var(--ui-element-spacing);
			right: var(--ui-element-spacing);
			bottom: var(--ui-element-spacing);
			width: auto;
			max-height: 60vh;
		}
	}

	@keyframes local-editor-pulse {
		0%   { box-shadow: 0 0 0 0 rgba(34, 204, 136, 0.5); }
		70%  { box-shadow: 0 0 0 0.8rem rgba(34, 204, 136, 0); }
		100% { box-shadow: 0 0 0 0 rgba(34, 204, 136, 0); }
	}
</style>
