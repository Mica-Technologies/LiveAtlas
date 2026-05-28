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
	<v-dialog v-model="dialogVisible" :persistent="required" max-width="80rem" scrollable>
		<v-card class="login-dialog">
			<v-card-title class="login-dialog__header">
				<span id="login__heading">{{ heading }}</span>
				<v-btn v-if="!required" icon variant="text" size="small" @click="close" :aria-label="messageClose" class="login-dialog__close">
					<SvgIcon name="cross" />
				</v-btn>
			</v-card-title>
			<v-card-text class="login-dialog__content">
				<LoginForm />
				<RegisterForm />
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import {computed, defineComponent} from "vue";
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import LoginForm from "@/components/login/LoginForm.vue";
import RegisterForm from "@/components/login/RegisterForm.vue";
import SvgIcon from "@/components/SvgIcon.vue";

export default defineComponent({
	components: {SvgIcon, RegisterForm, LoginForm},
	props: {
		required: {
			default: false,
			type: Boolean,
		}
	},
	setup(props) {
		const store = useStore(),
			heading = computed(() => store.state.messages.loginTitle),
			messageClose = computed(() => store.state.messages.closeTitle);

		const dialogVisible = computed({
			get: () => store.state.ui.visibleModal === 'login',
			set: (val: boolean) => {
				if(!val && !props.required) {
					store.commit(MutationTypes.HIDE_UI_MODAL, 'login');
				}
			}
		});

		const close = () => {
			if(!props.required) {
				store.commit(MutationTypes.HIDE_UI_MODAL, 'login');
			}
		};

		return {
			heading,
			messageClose,
			dialogVisible,
			close
		};
	}
});
</script>

<style lang="scss" scoped>
.login-dialog {
	background-color: var(--background-base);
	backdrop-filter: blur(8px) saturate(1.2);
	-webkit-backdrop-filter: blur(8px) saturate(1.2);
	border: 1px solid var(--border-color);

	body.always-opaque & {
		background-color: var(--background-base-solid);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	.login-dialog__header {
		text-align: center;
		position: relative;
		padding: 2rem 3rem 0.5rem;
	}

	.login-dialog__close {
		position: absolute;
		top: 0.8rem;
		right: 0.8rem;
	}

	.login-dialog__content {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		padding: 1.5rem 2rem 2rem;

		.form {
			flex: 1;
			min-width: 25rem;
		}
	}

	@media (max-width: 600px) {
		.login-dialog__content {
			flex-direction: column;

			.form {
				width: 100%;
			}
		}
	}
}
</style>
