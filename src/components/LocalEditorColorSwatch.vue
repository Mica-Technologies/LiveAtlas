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
	<div class="color-swatch">
		<v-menu :close-on-content-click="false" location="end">
			<template #activator="{ props: menuProps }">
				<button v-bind="menuProps" type="button" class="color-swatch__button"
					:style="{ backgroundColor: normalizedHex }"
					:aria-label="`Pick ${label || 'color'}`" :title="`Pick ${label || 'color'}`">
				</button>
			</template>
			<v-card class="color-swatch__picker">
				<v-color-picker
					:model-value="normalizedHex"
					@update:model-value="onPick"
					mode="hex" hide-inputs hide-mode-switch hide-canvas-actions
					show-swatches />
			</v-card>
		</v-menu>
		<button v-if="target" type="button" class="color-swatch__eyedropper"
			:class="{'color-swatch__eyedropper--active': isPickingHere}"
			:aria-label="isPickingHere
				? 'Cancel sampling'
				: `Click a marker on the map to sample its ${target === 'fill' ? 'fill' : 'line'} color and opacity`"
			:title="isPickingHere
				? 'Click again to cancel — or press Esc'
				: `Sample ${target === 'fill' ? 'fill' : 'line'} from a marker`"
			@click="toggleSample">
			<!-- inline eyedropper glyph (Material Design "eyedropper-variant") -->
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M20.71,5.63L18.37,3.29C18,2.9 17.34,2.9 16.96,3.29L13,7.25L11.91,6.16L10.5,7.58L11.62,8.7L4,16.32V20H7.68L15.3,12.38L16.42,13.5L17.84,12.09L16.75,11L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63M6.84,18H6V17.16L13.59,9.57L14.43,10.41L6.84,18Z" />
			</svg>
		</button>
		<v-text-field :model-value="modelValue" :label="label" density="compact" variant="outlined"
			hide-details class="color-swatch__field"
			@update:model-value="onTextInput" />
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {LocalEditorPickTarget} from "@/store/state";

// Always normalize to a 6-digit lowercased #RRGGBB so the v-color-picker
// gets a value it understands. Returns "#888888" for unparseable input
// (in which case the picker falls back to a neutral grey).
const normalizeHex = (input: string): string => {
	const trimmed = (input || '').trim().toLowerCase();
	const match = trimmed.match(/^#?([0-9a-f]{6})$/);
	if(match) return `#${match[1]}`;
	const match3 = trimmed.match(/^#?([0-9a-f]{3})$/);
	if(match3) {
		const [r, g, b] = match3[1];
		return `#${r}${r}${g}${g}${b}${b}`;
	}
	return '#888888';
};

export default defineComponent({
	name: 'LocalEditorColorSwatch',

	props: {
		modelValue: {
			type: String,
			required: true,
		},
		label: {
			type: String,
			default: 'Color',
		},
		// Whether this swatch represents the line or the fill colour of
		// the currently selected marker. When set, an eyedropper button is
		// rendered so the user can sample from an existing marker.
		// When undefined, no eyedropper is shown.
		target: {
			type: String as PropType<LocalEditorPickTarget | undefined>,
			default: undefined,
		},
		// The id of the marker whose style this swatch is editing. Required
		// when `target` is set — the picking pipeline needs to know which
		// marker to write back to.
		markerId: {
			type: String,
			default: '',
		},
	},

	emits: ['update:modelValue'],

	setup(props, {emit}) {
		const store = useStore();
		const normalizedHex = computed(() => normalizeHex(props.modelValue));

		const isPickingHere = computed(() => {
			const p = store.state.localEditor.picking;
			return !!p && !!props.target && p.markerId === props.markerId && p.target === props.target;
		});

		const toggleSample = () => {
			if(!props.target || !props.markerId) return;
			if(isPickingHere.value) {
				store.commit(MutationTypes.LOCAL_EDITOR_FINISH_PICKING, undefined);
				return;
			}
			store.commit(MutationTypes.LOCAL_EDITOR_START_PICKING, {
				markerId: props.markerId,
				target: props.target,
			});
		};

		const onPick = (val: string | object | null) => {
			// v-color-picker can emit either a string (in hex mode) or an
			// object with channels; strip alpha and emit a #rrggbb string.
			if(typeof val === 'string') {
				const m = val.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
				if(m) emit('update:modelValue', `#${m[1].toLowerCase()}`);
			} else if(val && typeof val === 'object' && 'r' in val) {
				const obj = val as {r: number, g: number, b: number};
				const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
				emit('update:modelValue', `#${hex(obj.r)}${hex(obj.g)}${hex(obj.b)}`);
			}
		};

		const onTextInput = (value: string) => {
			emit('update:modelValue', value);
		};

		return {
			normalizedHex,
			isPickingHere,
			toggleSample,
			onPick,
			onTextInput,
		};
	},
});
</script>

<style lang="scss">
	.color-swatch {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;

		&__button {
			width: 4rem;
			flex-shrink: 0;
			border: 2px solid var(--border-color);
			border-radius: 0.3rem;
			cursor: pointer;
			min-height: 3.5rem;
			padding: 0;

			&:hover {
				border-color: var(--text-subtle);
			}

			&:focus-visible {
				outline: 2px solid var(--outline-focus);
				outline-offset: 1px;
			}
		}

		&__eyedropper {
			width: 3.5rem;
			flex-shrink: 0;
			padding: 0;
			background-color: var(--background-light);
			border: 1px solid var(--border-color);
			border-radius: 0.3rem;
			color: var(--text-base);
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.1s ease, border-color 0.1s ease;

			svg {
				width: 1.8rem;
				height: 1.8rem;
			}

			&:hover {
				background-color: var(--background-medium, var(--background-light));
				border-color: var(--text-subtle);
			}

			&:focus-visible {
				outline: 2px solid var(--outline-focus);
				outline-offset: 1px;
			}

			&--active {
				background-color: rgba(34, 204, 136, 0.2);
				border-color: #22cc88;
				color: #22cc88;
				animation: color-swatch-eyedropper-pulse 1.2s ease-in-out infinite;
			}
		}

		&__field {
			flex: 1 1 auto;
			min-width: 0;
		}

		&__picker {
			background-color: var(--background-base) !important;
		}
	}

	@keyframes color-swatch-eyedropper-pulse {
		0%, 100% { box-shadow: 0 0 0 0 rgba(34, 204, 136, 0.5); }
		50% { box-shadow: 0 0 0 0.4rem rgba(34, 204, 136, 0); }
	}
</style>
