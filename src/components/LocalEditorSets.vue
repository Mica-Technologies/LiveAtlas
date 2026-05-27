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
	<details class="local-sets" :open="!sets.length">
		<summary class="local-sets__summary">
			Local marker sets ({{ sets.length }})
		</summary>
		<div class="local-sets__body">
			<p class="local-sets__hint">
				Local sets become part of the command output (<code>/dmarker addset</code>).
				Choose them as the target set when creating markers.
			</p>

			<div v-for="set in sets" :key="set.id" class="local-sets__row">
				<div class="local-sets__row-head">
					<code class="local-sets__id">{{ set.id }}</code>
					<v-btn icon variant="text" size="x-small" title="Delete set" @click="confirmDelete(set.id)">
						<SvgIcon name="cross" />
					</v-btn>
				</div>
				<v-text-field label="Label" density="compact" variant="outlined" hide-details
					:model-value="set.label" @update:model-value="update(set.id, {label: $event})" />
				<div class="local-sets__row-grid">
					<v-text-field label="Priority" type="number" density="compact" variant="outlined" hide-details
						:model-value="set.priority"
						@update:model-value="updateNumber(set.id, 'priority', $event)" />
					<v-text-field label="Min zoom" type="number" density="compact" variant="outlined" hide-details
						:model-value="set.minZoom ?? ''"
						@update:model-value="updateMinZoom(set.id, $event)" />
				</div>
				<label class="local-sets__hidden-toggle">
					<v-checkbox-btn density="compact" hide-details
						:model-value="set.hidden"
						@update:model-value="update(set.id, {hidden: !!$event})" />
					<span>Hidden by default</span>
				</label>
			</div>

			<form class="local-sets__new" @submit.prevent="add">
				<v-text-field label="New set label" density="compact" variant="outlined" hide-details
					v-model="newLabel" placeholder="e.g. Sin Island" />
				<v-text-field label="ID" density="compact" variant="outlined" hide-details
					v-model="newId" :placeholder="autoId || 'e.g. sin-island'"
					:error-messages="newIdError" :error="!!newIdError"
					@update:model-value="onIdInput">
					<template v-if="idAutoSynced && newId" #append-inner>
						<span class="local-sets__auto-badge" title="Auto-synced from label">Auto</span>
					</template>
				</v-text-field>
				<v-btn type="submit" variant="tonal" size="small" :disabled="!effectiveId">Add set</v-btn>
			</form>
		</div>
	</details>
</template>

<script lang="ts">
import {computed, defineComponent, ref, watch} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";
import {ID_PATTERN, slugifyId} from "@/util/localEditor";

export default defineComponent({
	name: 'LocalEditorSets',
	components: {SvgIcon},

	setup() {
		const store = useStore(),
			sets = computed(() => store.state.localEditor.sets),
			newLabel = ref(''),
			newId = ref(''),
			newIdError = ref(''),
			// Tracks whether the ID field has been manually edited. Once true,
			// the ID stops auto-syncing from the label until the form resets.
			idManuallyEdited = ref(false);

		const autoId = computed(() => slugifyId(newLabel.value));
		const effectiveId = computed(() => (newId.value.trim() || autoId.value));
		const idAutoSynced = computed(() => !idManuallyEdited.value);

		watch(newLabel, () => {
			if(!idManuallyEdited.value) {
				newId.value = autoId.value;
				newIdError.value = '';
			}
		});

		const onIdInput = (value: string) => {
			// An empty ID field reverts to auto-sync from the label.
			if(!value) {
				idManuallyEdited.value = false;
				newId.value = autoId.value;
			} else {
				idManuallyEdited.value = true;
			}
			newIdError.value = '';
		};

		const idExists = (id: string) =>
			store.state.markerSets.has(id) || sets.value.some(s => s.id === id);

		const add = () => {
			const id = effectiveId.value;
			const label = newLabel.value.trim() || id;
			if(!id) return;
			if(!ID_PATTERN.test(id)) {
				newIdError.value = 'Use letters, numbers, _, - only';
				return;
			}
			if(idExists(id)) {
				newIdError.value = 'That ID is already used';
				return;
			}
			store.commit(MutationTypes.LOCAL_EDITOR_ADD_SET, {
				id,
				label,
				hidden: false,
				priority: 0,
				minZoom: undefined,
			});
			newLabel.value = '';
			newId.value = '';
			newIdError.value = '';
			idManuallyEdited.value = false;
		};

		const update = (id: string, patch: Record<string, unknown>) => {
			store.commit(MutationTypes.LOCAL_EDITOR_UPDATE_SET, {id, patch});
		};

		const updateNumber = (id: string, key: string, value: string | number) => {
			const num = typeof value === 'string' ? parseFloat(value) : value;
			if(Number.isNaN(num)) return;
			update(id, {[key]: num});
		};

		const updateMinZoom = (id: string, value: string | number) => {
			if(value === '' || value === null) {
				update(id, {minZoom: undefined});
				return;
			}
			const num = typeof value === 'string' ? parseFloat(value) : value;
			if(Number.isNaN(num)) return;
			update(id, {minZoom: num});
		};

		const confirmDelete = (id: string) => {
			const usedBy = store.state.localEditor.markers.filter(m => m.setId === id).length;
			if(usedBy > 0) {
				const ok = window.confirm(`Set "${id}" is used by ${usedBy} pending marker(s). Delete anyway? Markers keep the set ID.`);
				if(!ok) return;
			}
			store.commit(MutationTypes.LOCAL_EDITOR_DELETE_SET, id);
		};

		return {
			sets,
			newLabel,
			newId,
			newIdError,
			autoId,
			effectiveId,
			idAutoSynced,
			onIdInput,
			add,
			update,
			updateNumber,
			updateMinZoom,
			confirmDelete,
		};
	},
});
</script>

<style lang="scss">
	.local-sets {
		border: 1px solid var(--border-color);
		border-radius: 0.4rem;
		background-color: var(--background-light);

		&__summary {
			cursor: pointer;
			padding: 0.6rem 1rem;
			font-size: 1.3rem;
			font-weight: 500;
			color: var(--text-base);
			user-select: none;
		}

		&__body {
			display: flex;
			flex-direction: column;
			gap: 0.8rem;
			padding: 0.6rem 1rem 1rem;
			border-top: 1px solid var(--border-color);
		}

		&__hint {
			margin: 0;
			font-size: 1.2rem;
			color: var(--text-subtle);
			line-height: 1.4;

			code {
				background-color: var(--background-base);
				padding: 0.05rem 0.4rem;
				border-radius: 0.2rem;
				font-size: 1.15rem;
			}
		}

		&__row {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding: 0.7rem 0.8rem;
			background-color: var(--background-base);
			border-radius: 0.4rem;
			border: 1px solid var(--border-color);
		}

		&__row-head {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		&__id {
			font-family: monospace;
			font-size: 1.25rem;
			color: var(--text-base);
		}

		&__row-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem;
		}

		&__hidden-toggle {
			display: flex;
			align-items: center;
			gap: 0.4rem;
			font-size: 1.25rem;
			color: var(--text-subtle);
			cursor: pointer;
			user-select: none;
		}

		&__new {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			align-items: stretch;
			padding: 0.7rem 0.8rem;
			background-color: var(--background-base);
			border-radius: 0.4rem;
			border: 1px dashed var(--border-color);

			button {
				align-self: flex-end;
			}
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
	}
</style>
