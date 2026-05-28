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
			<span class="local-editor__hover-coords" :class="{'local-editor__hover-coords--empty': !hoverCoords}"
				title="Cursor coordinates">
				<template v-if="hoverCoords">{{ hoverCoords }}</template>
				<template v-else>—, —, —</template>
			</span>
			<v-btn icon variant="text" size="small" title="Close editor" @click="close">
				<SvgIcon name="cross" />
			</v-btn>
		</header>

		<div v-if="drawing" class="local-editor__drawing-bar">
			<span class="local-editor__drawing-status">
				<span class="local-editor__drawing-pulse"></span>
				<template v-if="drawing.kind === 'circle-radius'">
					<span>Click on the map to set the circle radius</span>
				</template>
				<template v-else>
					<span class="local-editor__drawing-line">
						<strong>{{ drawingVertexCount }}</strong> vertex<template v-if="drawingVertexCount !== 1">es</template> placed &middot;
						click to add another
					</span>
					<span class="local-editor__drawing-hints">
						<kbd>Enter</kbd> or double-click to finish &middot;
						<kbd>Backspace</kbd> to undo &middot;
						<kbd>Shift</kbd> to skip snap &middot;
						<kbd>Esc</kbd> to cancel
					</span>
				</template>
			</span>
			<v-btn variant="flat" color="primary" size="small" @click="finishDrawing">Finish</v-btn>
		</div>
		<p v-else class="local-editor__hint">
			<strong>Tip:</strong> right-click on the map to add a marker. Your work stays
			in this browser until you generate commands.
		</p>

		<div class="local-editor__toggles">
			<label class="local-editor__snap-toggle">
				<v-checkbox-btn :model-value="snapEnabled" @update:model-value="setSnap" density="compact" hide-details />
				<span>Snap to nearby vertices</span>
			</label>
			<label class="local-editor__snap-toggle">
				<v-checkbox-btn :model-value="showVertexNumbers" @update:model-value="setShowVertexNumbers"
					density="compact" hide-details />
				<span>Show vertex numbers</span>
			</label>
		</div>

		<LocalEditorSets />

		<section class="local-editor__list" aria-label="Pending markers">
			<div v-if="!markers.length" class="local-editor__empty">No pending markers yet.</div>
			<button v-for="marker in markers" :key="marker.id" type="button"
				:ref="el => registerItemRef(marker.id, el as HTMLElement | null)"
				class="local-editor__list-item"
				:class="{ 'local-editor__list-item--selected': marker.id === selectedId,
					'local-editor__list-item--other-world': marker.worldName !== currentWorldName,
					'local-editor__list-item--edit': marker.origin === 'edit',
					'local-editor__list-item--delete': marker.origin === 'delete' }"
				@click="select(marker.id)">
				<span class="local-editor__list-label">
					<span class="local-editor__type-badge" :data-type="marker.type">{{ marker.type }}</span>
					<span v-if="marker.origin === 'edit'" class="local-editor__origin-badge local-editor__origin-badge--edit">Edit</span>
					<span v-else-if="marker.origin === 'delete'" class="local-editor__origin-badge local-editor__origin-badge--delete">Delete</span>
					{{ marker.label || marker.id }}
				</span>
				<span class="local-editor__list-meta">{{ markerSummary(marker) }}</span>
			</button>
		</section>

		<section v-if="selected" class="local-editor__form">
			<v-text-field label="Label" density="compact" variant="outlined" hide-details
				:model-value="selected.label" @update:model-value="updateField('label', $event)" />

			<v-text-field label="ID" density="compact" variant="outlined"
				:model-value="editingId" @update:model-value="onIdInput"
				@blur="commitId" @keydown.enter.prevent="commitId"
				:disabled="idLocked"
				:error-messages="editingIdError" :error="!!editingIdError"
				:hide-details="!editingIdError">
				<template v-if="idLocked" #append-inner>
					<span class="local-editor__auto-badge" :title="idLockedReason">Locked</span>
				</template>
				<template v-else-if="idIsAuto" #append-inner>
					<span class="local-editor__auto-badge" title="Auto-derived from label until you customize it">Auto</span>
				</template>
			</v-text-field>

			<v-alert v-if="selected.origin === 'delete'" type="warning" variant="tonal" density="compact"
				class="local-editor__delete-banner">
				Queued for deletion. The server marker stays untouched until you run the commands.
			</v-alert>

			<v-combobox label="Marker set" density="compact" variant="outlined" hide-details
				:items="setOptions" :model-value="selected.setId"
				@update:model-value="updateField('setId', $event)" />

			<!-- Point-only fields -->
			<template v-if="selected.type === 'point'">
				<div class="local-editor__icon-row">
					<v-text-field label="Icon ID" density="compact" variant="outlined" hide-details
						:model-value="selected.iconId"
						@update:model-value="updateField('iconId', $event)" class="local-editor__icon-field" />
					<LocalEditorIconPicker :model-value="selected.iconId"
						@update:model-value="updateField('iconId', $event)" />
				</div>

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
				<details class="local-editor__style" open>
					<summary>Style</summary>
					<div class="local-editor__style-stack">
						<LocalEditorColorSwatch label="Line color" target="line" :marker-id="selected.id"
							:model-value="(selected as any).style.lineColor"
							@update:model-value="updateStyle('lineColor', $event)" />
						<div class="local-editor__style-grid">
							<v-text-field label="Line opacity" type="number" density="compact" variant="outlined" hide-details
								:model-value="(selected as any).style.lineOpacity" min="0" max="1" step="0.05"
								@update:model-value="updateStyleNumber('lineOpacity', $event)" />
							<v-text-field label="Line weight" type="number" density="compact" variant="outlined" hide-details
								:model-value="(selected as any).style.lineWeight" min="1" step="1"
								@update:model-value="updateStyleNumber('lineWeight', $event)" />
						</div>
						<template v-if="selected.type !== 'line'">
							<LocalEditorColorSwatch label="Fill color" target="fill" :marker-id="selected.id"
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
				<!-- Edit-origin: offer queue-deletion + discard (which restores the server marker). -->
				<template v-if="selected.origin === 'edit'">
					<v-btn variant="text" size="small" color="warning" @click="toggleDelete">Queue deletion</v-btn>
					<v-btn variant="text" size="small" @click="discardEdit">Discard edit</v-btn>
				</template>
				<!-- Delete-origin: offer restore-to-edit + discard. The shape can't be field-edited. -->
				<template v-else-if="selected.origin === 'delete'">
					<v-btn variant="text" size="small" @click="toggleDelete">Edit instead</v-btn>
					<v-btn variant="text" size="small" @click="discardEdit">Discard</v-btn>
				</template>
				<!-- Locally-created marker: regular Delete button (drops from pending list). -->
				<v-btn v-else variant="text" size="small" color="error" @click="deleteSelected">Delete</v-btn>
			</div>
		</section>

		<footer class="local-editor__footer">
			<div class="local-editor__footer-row">
				<v-btn variant="text" size="small" color="error"
					:disabled="!hasAnythingSaved" @click="clearAll"
					title="Discard every pending marker, set, and any data stored in this browser.">
					Clear all saved
				</v-btn>
				<v-btn variant="text" size="small" @click="triggerImport"
					title="Load markers and sets from a previously exported file.">
					Import…
				</v-btn>
				<v-btn variant="text" size="small" :disabled="!hasAnythingToExport" @click="exportSnapshot"
					title="Download the pending markers and sets as a JSON file you can re-import later.">
					Export
				</v-btn>
			</div>
			<div class="local-editor__footer-row">
				<v-btn variant="tonal" size="small" :disabled="!markers.length" @click="persist">
					Save to browser
				</v-btn>
				<v-btn variant="flat" color="primary" size="small" :disabled="!markers.length" @click="showCommands">
					Get commands…
				</v-btn>
			</div>
			<input ref="importInputRef" type="file" accept="application/json,.json"
				class="local-editor__import-input" @change="onImportFile" />
		</footer>

		<v-dialog v-model="importConflictsOpen" max-width="48rem">
			<v-card class="local-editor__import-dialog">
				<v-card-title class="local-editor__import-dialog-title">
					Import has conflicting IDs
				</v-card-title>
				<v-card-text class="local-editor__import-dialog-body">
					<p>
						This file includes
						<template v-if="pendingImport && pendingImport.markerConflicts.length">
							<strong>{{ pendingImport.markerConflicts.length }}</strong> marker<template v-if="pendingImport.markerConflicts.length !== 1">s</template>
						</template>
						<template v-if="pendingImport && pendingImport.markerConflicts.length && pendingImport.setConflicts.length"> and </template>
						<template v-if="pendingImport && pendingImport.setConflicts.length">
							<strong>{{ pendingImport.setConflicts.length }}</strong> set<template v-if="pendingImport.setConflicts.length !== 1">s</template>
						</template>
						with IDs that already exist in your pending list.
					</p>
					<details v-if="pendingImport" class="local-editor__import-dialog-details">
						<summary>Show conflicting IDs</summary>
						<ul>
							<li v-for="id in pendingImport.markerConflicts" :key="`m-${id}`">
								<span class="local-editor__type-badge" data-type="point">marker</span>
								<code>{{ id }}</code>
							</li>
							<li v-for="id in pendingImport.setConflicts" :key="`s-${id}`">
								<span class="local-editor__type-badge" data-type="line">set</span>
								<code>{{ id }}</code>
							</li>
						</ul>
					</details>
					<p class="local-editor__import-dialog-question">
						How should those be handled? Non-conflicting items will be imported either way.
					</p>
				</v-card-text>
				<v-card-actions class="local-editor__import-dialog-actions">
					<v-btn variant="text" @click="cancelImport">Cancel import</v-btn>
					<v-btn variant="tonal" @click="resolveImport('local')">Keep local (skip conflicts)</v-btn>
					<v-btn variant="flat" color="primary" @click="resolveImport('imported')">Replace with imported</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</aside>
</template>

<script lang="ts">
import {computed, defineComponent, nextTick, ref, watch} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {
	AUTO_MARKER_ID_PATTERN,
	DEFAULT_ICON_IDS,
	ID_PATTERN,
	LocalEditorAreaMarker,
	LocalEditorCircleMarker,
	LocalEditorLineMarker,
	LocalEditorMarker,
	LocalEditorPointMarker,
	LocalEditorSet,
	parseSnapshot,
	PathStyle,
	serializeSnapshot,
	slugifyId,
} from "@/util/localEditor";
import {Coordinate} from "@/index";
import SvgIcon from "@/components/SvgIcon.vue";
import LocalEditorSets from "@/components/LocalEditorSets.vue";
import LocalEditorIconPicker from "@/components/LocalEditorIconPicker.vue";
import LocalEditorColorSwatch from "@/components/LocalEditorColorSwatch.vue";
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
	components: {SvgIcon, LocalEditorSets, LocalEditorIconPicker, LocalEditorColorSwatch},

	setup() {
		const store = useStore(),
			active = computed(() => store.state.localEditor.active),
			markers = computed(() => store.state.localEditor.markers),
			selectedId = computed(() => store.state.localEditor.selectedId),
			selected = computed(() => markers.value.find(m => m.id === selectedId.value)),
			currentWorldName = computed(() => store.state.currentWorld?.name),
			markerSets = computed(() => store.state.markerSets),
			drawing = computed(() => store.state.localEditor.drawing),
			snapEnabled = computed(() => store.state.localEditor.snapEnabled),
			showVertexNumbers = computed(() => store.state.localEditor.showVertexNumbers),
			hoverLocation = computed(() => store.state.localEditor.hoverLocation);

		// Format the cursor coords as "X, Y, Z" with the same rounding the
		// regular bottom-left CoordinatesControl uses.
		const hoverCoords = computed(() => {
			const l = hoverLocation.value;
			if(!l) return '';
			return `${Math.round(l.x)}, ${Math.round(l.y)}, ${Math.round(l.z)}`;
		});

		// Vertex count for the drawing-bar's progress label. 0 for circle
		// (which has its own copy) and for any unexpected marker shape.
		const drawingVertexCount = computed((): number => {
			const d = drawing.value;
			if(!d || (d.kind !== 'area' && d.kind !== 'line')) return 0;
			const m = markers.value.find(mm => mm.id === d.id);
			if(!m || (m.type !== 'area' && m.type !== 'line')) return 0;
			return m.points.length;
		});

		const setOptions = computed(() => {
			const opts = new Set<string>();
			markerSets.value.forEach((_set, id) => opts.add(id));
			store.state.localEditor.sets.forEach(s => opts.add(s.id));
			return Array.from(opts).sort();
		});

		const iconOptions = [...DEFAULT_ICON_IDS].sort();
		void iconOptions; // Retained in case we want fallback combobox suggestions

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

		// Per-marker refs to the pending-list buttons so we can scroll the
		// selected one into view (useful when selection is driven by a click
		// on the map rather than the list itself).
		const itemRefs = new Map<string, HTMLElement>();
		const registerItemRef = (id: string, el: HTMLElement | null) => {
			if(el) itemRefs.set(id, el);
			else itemRefs.delete(id);
		};

		watch(selectedId, (id) => {
			if(!id) return;
			// Wait for the v-for to settle on the next tick before reading
			// the ref — selection often changes in the same tick the marker
			// is added.
			nextTick(() => {
				const el = itemRefs.get(id);
				if(el) el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
			});
		});

		const commitPatch = (patch: Partial<LocalEditorMarker>) => {
			if(!selectedId.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {id: selectedId.value, patch});
		};

		// Local buffer for the ID field. We don't commit on every keystroke
		// because the id is a primary key (layer cache, selectedId, etc.) and
		// mid-typing intermediates would thrash those references.
		const editingId = ref(''),
			editingIdError = ref('');

		// The id counts as "auto" if either:
		//  - it still matches the localmarker_N pattern (never been touched), or
		//  - it equals the slug of the current label (in sync with the label).
		// Once the user customizes it to something else, the id stops being
		// auto and label edits no longer rewrite it.
		const isMarkerIdAuto = (m: LocalEditorMarker): boolean =>
			AUTO_MARKER_ID_PATTERN.test(m.id) || m.id === slugifyId(m.label || '');

		const renameMarker = (oldId: string, newId: string): void => {
			if(oldId === newId) return;
			// Skip mid-draw/mid-pick — in-flight handlers (vertex add, color
			// eyedropper) still reference oldId. The auto-sync will pick up
			// again on the next label edit once the operation finishes.
			const d = store.state.localEditor.drawing;
			const p = store.state.localEditor.picking;
			if(d?.id === oldId || p?.markerId === oldId) return;
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_MARKER, {
				id: oldId,
				patch: {id: newId},
			});
			// Keep the selection on the same marker after the rename.
			if(store.state.localEditor.selectedId === oldId) {
				store.commit(MutationTypes.LOCAL_EDITOR_SELECT_MARKER, newId);
			}
		};

		const updateField = (key: string, value: unknown) => {
			// Special handling for label: when the current id is still auto,
			// derive a new id from the new label and rename in lockstep.
			// Skip the rename half for edits/deletes — those IDs are pinned
			// to the original server marker.
			if(key === 'label' && selected.value) {
				const m = selected.value;
				const idIsPinned = m.origin === 'edit' || m.origin === 'delete';
				const wasAuto = !idIsPinned && isMarkerIdAuto(m);
				commitPatch({label: value} as Partial<LocalEditorMarker>);
				if(!wasAuto) return;
				const slug = slugifyId(String(value ?? ''));
				if(!slug || slug === m.id) return;
				if(markers.value.some(mm => mm.id === slug)) return;
				renameMarker(m.id, slug);
				editingId.value = slug;
				return;
			}
			commitPatch({[key]: value} as Partial<LocalEditorMarker>);
		};

		// Reset the local id buffer whenever the selection changes.
		watch(() => selected.value?.id, (id) => {
			editingId.value = id ?? '';
			editingIdError.value = '';
		}, {immediate: true});

		const onIdInput = (value: string) => {
			editingId.value = value;
			editingIdError.value = '';
		};

		const idIsAuto = computed(() => {
			const m = selected.value;
			return !!m && isMarkerIdAuto(m);
		});

		// Edits keep the original server ID (so /dmarker update can target
		// it); deletes don't need an editable ID either.
		const idLocked = computed(() => {
			const m = selected.value;
			return !!m && (m.origin === 'edit' || m.origin === 'delete');
		});

		const idLockedReason = computed(() => {
			const m = selected.value;
			if(m?.origin === 'delete') return 'ID is locked while queued for deletion';
			return 'ID matches the existing server marker';
		});

		const toggleDelete = () => {
			if(!selectedId.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_TOGGLE_DELETE, selectedId.value);
		};

		const discardEdit = () => {
			if(!selectedId.value) return;
			store.commit(MutationTypes.LOCAL_EDITOR_DISCARD_EDIT, selectedId.value);
		};

		const commitId = () => {
			const m = selected.value;
			if(!m) return;
			const next = editingId.value.trim();
			if(!next) {
				editingIdError.value = 'ID is required';
				editingId.value = m.id;
				return;
			}
			if(next === m.id) {
				editingIdError.value = '';
				return;
			}
			if(!ID_PATTERN.test(next)) {
				editingIdError.value = 'Use letters, numbers, _, - only';
				return;
			}
			if(markers.value.some(mm => mm.id === next)) {
				editingIdError.value = 'That ID is already used';
				return;
			}
			renameMarker(m.id, next);
			editingIdError.value = '';
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

		const setShowVertexNumbers = (enabled: boolean) => {
			store.commit(MutationTypes.LOCAL_EDITOR_SET_SHOW_VERTEX_NUMBERS, !!enabled);
		};

		// Anything worth clearing? Either there's something in-memory or the
		// localStorage entry (left over from a previous session) is present.
		const hasAnythingSaved = computed(() => {
			if(markers.value.length || store.state.localEditor.sets.length) return true;
			try {
				return !!localStorage.getItem('liveatlas-local-editor');
			} catch(e) {
				return false;
			}
		});

		const clearAll = () => {
			const count = markers.value.length;
			const message = count
				? `Discard all ${count} pending marker(s), any pending sets, and the saved browser copy?`
				: 'Discard any pending sets and the saved browser copy?';
			if(!window.confirm(message)) return;
			store.commit(MutationTypes.LOCAL_EDITOR_CLEAR_MARKERS, undefined);
		};

		// --- Import / Export ---
		const importInputRef = ref<HTMLInputElement | null>(null);

		const hasAnythingToExport = computed(() =>
			markers.value.length > 0 || store.state.localEditor.sets.length > 0);

		const exportSnapshot = () => {
			const json = serializeSnapshot(markers.value, store.state.localEditor.sets);
			const blob = new Blob([json], {type: 'application/json'});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			const stamp = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `liveatlas-local-editor-${stamp}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		};

		// Snapshot held between "file parsed, conflicts detected" and
		// "user picked a resolution". Null when no import is in flight or
		// when the import had no conflicts (and was applied directly).
		interface PendingImport {
			markers: LocalEditorMarker[];
			sets: LocalEditorSet[];
			markerConflicts: string[];
			setConflicts: string[];
		}
		const pendingImport = ref<PendingImport | null>(null);
		const importConflictsOpen = computed({
			get: () => pendingImport.value !== null,
			set: (val: boolean) => { if(!val) pendingImport.value = null; },
		});

		const triggerImport = () => {
			importInputRef.value?.click();
		};

		// Apply an import. When `mode === 'imported'`, conflicting locals are
		// overwritten by the file's version; when `'local'`, the local entry
		// wins (conflicting incoming items are skipped). Non-conflicting
		// items always import.
		const applyImport = (data: PendingImport, mode: 'imported' | 'local') => {
			const existingMarkerIds = new Set(markers.value.map(m => m.id));
			const existingSetIds = new Set(store.state.localEditor.sets.map(s => s.id));

			const markersToAdd: LocalEditorMarker[] = [];
			const markersToReplace: LocalEditorMarker[] = [];
			for(const m of data.markers) {
				if(existingMarkerIds.has(m.id)) {
					if(mode === 'imported') markersToReplace.push(m);
				} else {
					markersToAdd.push(m);
				}
			}
			const setsToAdd: LocalEditorSet[] = [];
			const setsToReplace: LocalEditorSet[] = [];
			for(const s of data.sets) {
				if(existingSetIds.has(s.id)) {
					if(mode === 'imported') setsToReplace.push(s);
				} else {
					setsToAdd.push(s);
				}
			}

			store.commit(MutationTypes.LOCAL_EDITOR_IMPORT, {
				markersToAdd, markersToReplace, setsToAdd, setsToReplace,
			});

			const added = markersToAdd.length + markersToReplace.length;
			const skipped = data.markers.length - added;
			const parts = [`Imported ${added} marker(s)`];
			if(setsToAdd.length || setsToReplace.length) {
				parts.push(`${setsToAdd.length + setsToReplace.length} set(s)`);
			}
			if(skipped > 0) parts.push(`skipped ${skipped} conflict(s)`);
			notify({type: 'success', text: parts.join(', ')});
		};

		const resolveImport = (mode: 'imported' | 'local') => {
			const data = pendingImport.value;
			if(!data) return;
			pendingImport.value = null;
			applyImport(data, mode);
		};

		const cancelImport = () => {
			pendingImport.value = null;
		};

		const onImportFile = async (event: Event) => {
			const input = event.target as HTMLInputElement;
			const file = input.files?.[0];
			// Reset the input value so picking the same file twice still fires
			// the change event.
			input.value = '';
			if(!file) return;

			let raw: string;
			try {
				raw = await file.text();
			} catch(e) {
				notify({type: 'error', text: 'Could not read that file'});
				return;
			}

			const parsed = parseSnapshot(raw);
			if(!parsed) {
				notify({type: 'error', text: 'That file is not a valid LiveAtlas editor export'});
				return;
			}

			// Dedupe by id within the import so an internally-broken file
			// doesn't surface a "conflict" against itself.
			const seenMarkerIds = new Set<string>();
			const uniqueMarkers = parsed.markers.filter(m => {
				if(seenMarkerIds.has(m.id)) return false;
				seenMarkerIds.add(m.id);
				return true;
			});
			const seenSetIds = new Set<string>();
			const uniqueSets = parsed.sets.filter(s => {
				if(seenSetIds.has(s.id)) return false;
				seenSetIds.add(s.id);
				return true;
			});

			const existingMarkerIds = new Set(markers.value.map(m => m.id));
			const existingSetIds = new Set(store.state.localEditor.sets.map(s => s.id));
			const markerConflicts = uniqueMarkers.filter(m => existingMarkerIds.has(m.id)).map(m => m.id);
			const setConflicts = uniqueSets.filter(s => existingSetIds.has(s.id)).map(s => s.id);

			const data: PendingImport = {
				markers: uniqueMarkers,
				sets: uniqueSets,
				markerConflicts,
				setConflicts,
			};

			if(!markerConflicts.length && !setConflicts.length) {
				// Clean import — just apply with either mode (no conflicts
				// means the mode flag doesn't matter).
				applyImport(data, 'imported');
				return;
			}

			pendingImport.value = data;
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
			drawingVertexCount,
			snapEnabled,
			showVertexNumbers,
			hoverCoords,
			setShowVertexNumbers,
			hasAnythingSaved,
			clearAll,
			hasAnythingToExport,
			exportSnapshot,
			triggerImport,
			onImportFile,
			importInputRef,
			pendingImport,
			importConflictsOpen,
			resolveImport,
			cancelImport,

			editingId,
			editingIdError,
			idIsAuto,
			idLocked,
			idLockedReason,
			onIdInput,
			commitId,
			toggleDelete,
			discardEdit,

			close,
			select,
			registerItemRef,
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
		width: 40rem;
		max-width: calc(100vw - 2 * var(--ui-element-spacing));
		z-index: 120;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		// Match the glass surface used by the sidebar/menus/dialogs so the
		// editor reads as part of the same UI rather than a separate widget.
		background-color: var(--background-base);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		border: 1px solid var(--border-color);
		border-radius: var(--border-radius);
		box-shadow: var(--box-shadow);
		color: var(--text-base);
		font-size: 1.4rem;
		overflow: hidden;
		pointer-events: auto;

		// While the map is actively moving (drag or zoom animation), drop
		// the backdrop-blur and use an opaque surface. The blur otherwise
		// recomputes every frame the pixels behind it change, dominating
		// drag perf with this tall full-height panel. Map.vue toggles the
		// body class via Leaflet movestart/moveend.
		body.map-moving & {
			background-color: var(--background-base-solid);
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

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

		&__hover-coords {
			flex: 1 1 auto;
			margin: 0 1rem;
			font-family: monospace;
			font-size: 1.25rem;
			color: var(--text-base);
			text-align: right;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;

			&--empty {
				color: var(--text-disabled);
			}
		}

		&__toggles {
			display: flex;
			flex-wrap: wrap;
			column-gap: 1.2rem;
			row-gap: 0.3rem;
		}

		&__hint {
			margin: 0;
			padding: 0.8rem 1rem;
			background-color: var(--background-light);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius);
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
			align-items: flex-start;
			gap: 0.6rem;
			flex-wrap: wrap;
			min-width: 0;
			flex: 1 1 auto;
			color: var(--text-base);
		}

		&__drawing-line {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			line-height: 1.3;
		}

		&__drawing-hints {
			flex-basis: 100%;
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.3rem;
			font-size: 1.15rem;
			color: var(--text-subtle);
			line-height: 1.4;
			padding-left: 1.6rem;

			kbd {
				display: inline-block;
				padding: 0.05rem 0.45rem;
				background-color: var(--background-base);
				border: 1px solid var(--border-color);
				border-bottom-width: 2px;
				border-radius: 0.3rem;
				font-family: monospace;
				font-size: 1.05rem;
				line-height: 1.3;
				color: var(--text-base);
			}
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
			border-radius: var(--border-radius);
			color: inherit;
			cursor: pointer;
			text-align: left;

			&:hover {
				background-color: var(--background-hover);
			}

			&--selected,
			&--selected:hover {
				background-color: var(--background-light);
				outline: 2px solid var(--outline-focus);
				outline-offset: -2px;
			}

			&--other-world {
				opacity: 0.6;
			}

			&--edit {
				border-left: 3px solid #78b4ff;
			}

			&--delete {
				border-left: 3px solid #dc6464;
				text-decoration: line-through;
				text-decoration-color: rgba(220, 100, 100, 0.5);
			}
		}

		&__origin-badge {
			display: inline-block;
			padding: 0.1rem 0.5rem;
			font-size: 1rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			border-radius: 0.25rem;

			&--edit {
				background-color: rgba(120, 180, 255, 0.2);
				color: #78b4ff;
			}

			&--delete {
				background-color: rgba(220, 100, 100, 0.2);
				color: #dc6464;
				text-decoration: none;
			}
		}

		&__delete-banner {
			font-size: 1.25rem;
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

		&__auto-badge {
			font-size: 1rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: var(--text-subtle);
			background-color: var(--background-light);
			border: 1px solid var(--border-color);
			border-radius: 0.2rem;
			padding: 0.1rem 0.35rem;
			margin-right: 0.2rem;
			user-select: none;
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
		}

		&__style-stack {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding-top: 0.5rem;
		}

		&__icon-row {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
		}

		&__icon-field {
			flex: 1 1 auto;
		}

		&__form-actions {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
		}

		&__footer {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
			padding-top: 0.5rem;
			border-top: 1px solid var(--border-color);
			flex-shrink: 0;
		}

		&__footer-row {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		&__import-input {
			display: none;
		}

		&__import-dialog {
			background-color: var(--background-base);
			backdrop-filter: blur(24px) saturate(1.2);
			-webkit-backdrop-filter: blur(24px) saturate(1.2);
			border: 1px solid var(--border-color);
			color: var(--text-base);
		}

		&__import-dialog-title {
			font-size: 1.8rem;
			padding: 1.5rem 2rem 0.5rem;
		}

		&__import-dialog-body {
			display: flex;
			flex-direction: column;
			gap: 0.8rem;
			padding: 1rem 2rem;
			font-size: 1.4rem;
			line-height: 1.4;
			color: var(--text-base);

			code {
				font-family: monospace;
				font-size: 1.25rem;
				background-color: var(--background-light);
				padding: 0.05rem 0.4rem;
				border-radius: 0.2rem;
			}
		}

		&__import-dialog-details {
			background-color: var(--background-light);
			border: 1px solid var(--border-color);
			border-radius: 0.4rem;
			padding: 0.5rem 0.8rem;

			summary {
				cursor: pointer;
				font-size: 1.25rem;
				color: var(--text-subtle);
				user-select: none;
			}

			ul {
				margin: 0.5rem 0 0;
				padding: 0;
				list-style: none;
				display: flex;
				flex-direction: column;
				gap: 0.3rem;
				max-height: 20rem;
				overflow-y: auto;
			}

			li {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				font-size: 1.25rem;
			}
		}

		&__import-dialog-question {
			margin: 0;
			color: var(--text-subtle);
			font-size: 1.3rem;
		}

		&__import-dialog-actions {
			padding: 0.5rem 2rem 1.5rem;
			gap: 0.5rem;
			justify-content: flex-end;
			flex-wrap: wrap;
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
