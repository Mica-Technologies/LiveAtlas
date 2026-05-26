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
	<v-menu :close-on-content-click="false" location="end" max-height="50rem">
		<template #activator="{ props: menuProps }">
			<v-btn v-bind="menuProps" variant="tonal" size="small" class="icon-picker__trigger">
				<img v-if="currentUrl" :src="currentUrl" width="16" height="16" class="icon-picker__preview" />
				Browse icons…
			</v-btn>
		</template>

		<v-card class="icon-picker">
			<v-text-field v-model="filter" density="compact" variant="outlined" hide-details
				placeholder="Search icons…" class="icon-picker__search" autofocus />

			<div class="icon-picker__grid" role="listbox">
				<button v-for="entry in filtered" :key="entry.id" type="button"
					class="icon-picker__item" :class="{'icon-picker__item--selected': entry.id === modelValue}"
					:title="entry.id" role="option" :aria-selected="entry.id === modelValue"
					@click="select(entry.id)">
					<img v-if="entry.url" :src="entry.url" width="20" height="20" class="icon-picker__img"
						loading="lazy" @error="onImageError(entry.id)" />
					<span v-else class="icon-picker__no-img">?</span>
					<span class="icon-picker__id">{{ entry.id }}</span>
				</button>
			</div>

			<div v-if="!filtered.length" class="icon-picker__empty">No icons match "{{ filter }}"</div>

			<p class="icon-picker__footer">
				{{ urlPrefix ? 'Previews use this server\'s marker icons.' : 'No icon previews available — paste any icon ID directly.' }}
			</p>
		</v-card>
	</v-menu>
</template>

<script lang="ts">
import {computed, defineComponent, ref} from "vue";
import {useStore} from "@/store";
import {nonReactiveState} from "@/store/state";
import {LiveAtlasPointMarker} from "@/index";
import {LiveAtlasMarkerType} from "@/util/markers";
import {
	DEFAULT_ICON_IDS,
	extractIconUrlPrefix,
	parseIconIdFromUrl,
} from "@/util/localEditor";

interface IconEntry {
	id: string;
	url: string | null;
}

export default defineComponent({
	name: 'LocalEditorIconPicker',

	props: {
		modelValue: {
			type: String,
			required: true,
		},
	},

	emits: ['update:modelValue'],

	setup(props, {emit}) {
		void useStore(); // Touch the store so reactivity to markerSets works
		const filter = ref(''),
			failed = ref(new Set<string>());

		// Walk the currently loaded markers to (1) find the icon URL prefix
		// the server uses, and (2) discover icon IDs beyond the stock list.
		const harvested = computed(() => {
			const ids = new Set<string>();
			let prefix: string | null = null;

			for(const setMarkers of nonReactiveState.markers.values()) {
				for(const m of setMarkers.values()) {
					if(m.type !== LiveAtlasMarkerType.POINT) continue;
					const url = (m as LiveAtlasPointMarker).iconUrl;
					if(!url) continue;
					if(!prefix) prefix = extractIconUrlPrefix(url);
					const id = parseIconIdFromUrl(url);
					if(id) ids.add(id);
				}
			}

			return {prefix, ids};
		});

		const urlPrefix = computed(() => harvested.value.prefix);

		const entries = computed((): IconEntry[] => {
			const ids = new Set<string>([...DEFAULT_ICON_IDS, ...harvested.value.ids]);
			const prefix = urlPrefix.value;
			return Array.from(ids).sort().map(id => ({
				id,
				url: prefix && !failed.value.has(id) ? `${prefix}${id}.png` : null,
			}));
		});

		const filtered = computed(() => {
			const q = filter.value.trim().toLowerCase();
			if(!q) return entries.value;
			return entries.value.filter(e => e.id.toLowerCase().includes(q));
		});

		const currentUrl = computed(() => {
			const prefix = urlPrefix.value;
			if(!prefix || failed.value.has(props.modelValue)) return null;
			return `${prefix}${props.modelValue}.png`;
		});

		const select = (id: string) => {
			emit('update:modelValue', id);
		};

		const onImageError = (id: string) => {
			failed.value.add(id);
		};

		return {
			filter,
			filtered,
			urlPrefix,
			currentUrl,
			select,
			onImageError,
		};
	},
});
</script>

<style lang="scss">
	.icon-picker {
		min-width: 30rem;
		max-width: 36rem;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background-color: var(--background-base);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		border: 1px solid var(--border-color);
		color: var(--text-base);

		&__trigger {
			align-self: flex-start;
		}

		&__preview {
			margin-right: 0.4rem;
			image-rendering: pixelated;
		}

		&__grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
			gap: 0.3rem;
			max-height: 32rem;
			overflow-y: auto;
		}

		&__item {
			display: flex;
			align-items: center;
			gap: 0.4rem;
			padding: 0.4rem 0.5rem;
			background-color: var(--background-light);
			border: 1px solid transparent;
			border-radius: 0.3rem;
			color: inherit;
			cursor: pointer;
			text-align: left;
			min-width: 0;

			&:hover {
				border-color: var(--border-color);
			}

			&--selected {
				border-color: #f6a623;
				background-color: rgba(246, 166, 35, 0.15);
			}
		}

		&__img, &__no-img {
			flex-shrink: 0;
			width: 2rem;
			height: 2rem;
			image-rendering: pixelated;
			object-fit: contain;
		}

		&__no-img {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background-color: var(--background-base);
			border: 1px dashed var(--border-color);
			border-radius: 0.2rem;
			font-family: monospace;
			color: var(--text-subtle);
			font-size: 1.1rem;
		}

		&__id {
			font-family: monospace;
			font-size: 1.15rem;
			color: var(--text-subtle);
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__empty {
			padding: 1rem;
			text-align: center;
			color: var(--text-disabled);
			font-style: italic;
			font-size: 1.3rem;
		}

		&__footer {
			margin: 0;
			padding-top: 0.4rem;
			border-top: 1px solid var(--border-color);
			font-size: 1.1rem;
			color: var(--text-subtle);
		}
	}
</style>
