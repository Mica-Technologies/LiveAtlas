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
	<v-dialog v-model="dialogVisible" max-width="80rem" scrollable>
		<v-card class="commands-dialog">
			<v-card-title class="commands-dialog__header">
				<span>Dynmap commands</span>
				<v-btn icon variant="text" size="small" aria-label="Close" @click="close">
					<SvgIcon name="cross" />
				</v-btn>
			</v-card-title>
			<v-card-text class="commands-dialog__content">
				<p class="commands-dialog__summary">
					Run these on the server (e.g. via console or as an op) to create the markers.
					Sets that don't already exist on the server will get an
					<code>addset</code> command emitted first.
				</p>
				<pre class="commands-dialog__output" tabindex="0">{{ output }}</pre>
				<v-btn
					v-clipboard:copy="output"
					v-clipboard:success="copySuccess"
					v-clipboard:error="copyError"
					variant="flat" color="primary"
					:disabled="!output.length">
					Copy to clipboard
				</v-btn>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {generateCommands} from "@/util/localEditor";
import {clipboardError, clipboardSuccess} from "@/util";
import SvgIcon from "@/components/SvgIcon.vue";

export default defineComponent({
	name: 'LocalEditorCommandsModal',
	components: {SvgIcon},

	setup() {
		const store = useStore(),
			dialogVisible = computed({
				get: () => store.state.localEditor.commandsModalOpen,
				set: (val: boolean) => store.commit(MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL, val),
			}),
			existingSetIds = computed(() => new Set(store.state.markerSets.keys())),
			localSets = computed(() => store.state.localEditor.sets),
			output = computed(() => generateCommands(
				store.state.localEditor.markers,
				{existingSetIds: existingSetIds.value, localSets: localSets.value},
			).join('\n'));

		const close = () => store.commit(MutationTypes.LOCAL_EDITOR_SET_COMMANDS_MODAL, false);

		return {
			dialogVisible,
			output,
			close,
			copySuccess: clipboardSuccess(store),
			copyError: clipboardError(store),
		};
	},
});
</script>

<style lang="scss" scoped>
	.commands-dialog {
		background-color: var(--background-base);
		backdrop-filter: blur(8px) saturate(1.2);
		-webkit-backdrop-filter: blur(8px) saturate(1.2);
		border: 1px solid var(--border-color);
	}

	.commands-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem 0.5rem;
		font-size: 1.8rem;
	}

	.commands-dialog__content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 2rem 2rem;
	}

	.commands-dialog__summary {
		margin: 0;
		font-size: 1.4rem;
		color: var(--text-subtle);
		line-height: 1.4;

		code {
			background-color: var(--background-light);
			padding: 0.1rem 0.4rem;
			border-radius: 0.3rem;
			font-size: 1.3rem;
		}
	}

	.commands-dialog__output {
		margin: 0;
		padding: 1rem 1.2rem;
		background-color: var(--background-light);
		border-radius: 0.4rem;
		font-family: monospace;
		font-size: 1.3rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 40vh;
		overflow-y: auto;
		color: var(--text-base);
	}
</style>
