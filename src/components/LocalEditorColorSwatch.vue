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
		<v-text-field :model-value="modelValue" :label="label" density="compact" variant="outlined"
			hide-details class="color-swatch__field"
			@update:model-value="onTextInput" />
	</div>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";

// Always normalize to a 6-digit lowercased #RRGGBB so the v-color-picker
// gets a value it understands. Returns empty string when the input doesn't
// look like a hex color yet (in which case the picker falls back to its
// last valid value).
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
	},

	emits: ['update:modelValue'],

	setup(props, {emit}) {
		const normalizedHex = computed(() => normalizeHex(props.modelValue));

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

		&__field {
			flex: 1 1 auto;
			min-width: 0;
		}

		&__picker {
			background-color: var(--background-base) !important;
		}
	}
</style>
