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
				<v-text-field label="New set ID" density="compact" variant="outlined" hide-details
					v-model="newId" placeholder="e.g. landmarks"
					:error-messages="newIdError" :error="!!newIdError" />
				<v-btn type="submit" variant="tonal" size="small" :disabled="!newId.trim()">Add set</v-btn>
			</form>
		</div>
	</details>
</template>

<script lang="ts">
import {computed, defineComponent, ref} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import SvgIcon from "@/components/SvgIcon.vue";

export default defineComponent({
	name: 'LocalEditorSets',
	components: {SvgIcon},

	setup() {
		const store = useStore(),
			sets = computed(() => store.state.localEditor.sets),
			newId = ref(''),
			newIdError = ref('');

		const idExists = (id: string) =>
			store.state.markerSets.has(id) || sets.value.some(s => s.id === id);

		const add = () => {
			const id = newId.value.trim();
			if(!id) return;
			if(!/^[a-z0-9_-]+$/i.test(id)) {
				newIdError.value = 'Use letters, numbers, _, - only';
				return;
			}
			if(idExists(id)) {
				newIdError.value = 'That ID is already used';
				return;
			}
			store.commit(MutationTypes.LOCAL_EDITOR_ADD_SET, {
				id,
				label: id,
				hidden: false,
				priority: 0,
				minZoom: undefined,
			});
			newId.value = '';
			newIdError.value = '';
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
			newId,
			newIdError,
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
			gap: 0.5rem;
			align-items: flex-start;
		}
	}
</style>
