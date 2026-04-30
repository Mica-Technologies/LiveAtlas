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
	<v-form :class="{'form': true, 'form--invalid': invalid}" @submit.prevent="register" ref="form" fast-fail>
		<h3>{{ messageHeading }}</h3>
		<p class="form__description">{{ messageDescription }}</p>

		<v-text-field
			id="register-username"
			v-model="valueUsername"
			:label="messageUsernameLabel"
			type="text"
			name="username"
			autocomplete="username"
			variant="outlined"
			density="compact"
			required
			:rules="[v => !!v || '']"
		/>

		<v-text-field
			id="register-password"
			v-model="valuePassword"
			:label="messagePasswordLabel"
			type="password"
			name="password"
			autocomplete="new-password"
			variant="outlined"
			density="compact"
			required
			:rules="[v => !!v || '']"
		/>

		<v-text-field
			id="register-confirm-password"
			v-model="valuePassword2"
			:label="messageConfirmPasswordLabel"
			type="password"
			name="confirm_password"
			autocomplete="new-password"
			variant="outlined"
			density="compact"
			required
			:rules="[passwordMatchRule]"
		/>

		<v-text-field
			id="register-code"
			v-model="valueCode"
			:label="messageRegisterCodeLabel"
			type="tel"
			name="code"
			variant="outlined"
			density="compact"
			required
			:rules="[v => !!v || '', v => (v && v.length === 9) || '']"
			minlength="9"
			maxlength="9"
		/>

		<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>

		<v-btn type="submit" :disabled="submitting" :loading="submitting" color="primary" block>{{ messageSubmit }}</v-btn>
	</v-form>
</template>

<script lang="ts">
import {defineComponent, watch, computed, ref} from "vue";
import {useStore} from "@/store";
import {ActionTypes} from "@/store/action-types";
import {MutationTypes} from "@/store/mutation-types";

export default defineComponent({
	setup() {
		const store = useStore(),
			form = ref<InstanceType<typeof import('vuetify/components').VForm> | null>(null),

			loginModalVisible = computed(() => store.state.ui.visibleModal === 'login'),

			messageUsernameLabel = computed(() => store.state.messages.loginUsernameLabel),
			messagePasswordLabel = computed(() => store.state.messages.loginPasswordLabel),
			messageConfirmPasswordLabel = computed(() => store.state.messages.registerConfirmPasswordLabel),
			messageRegisterCodeLabel = computed(() => store.state.messages.registerCodeLabel),

			messageHeading = computed(() => store.state.messages.registerHeading),
			messageDescription = computed(() => store.state.messages.registerDescription),
			messageSubmit = computed(() => store.state.messages.registerSubmit),
			messagePasswordMismatch = computed(() => store.state.messages.registerErrorVerifyFailed),

			valueUsername = ref(''),
			valuePassword = ref(''),
			valuePassword2 = ref(''),
			valueCode = ref(''),

			submitting = ref(false),
			invalid = ref(false),
			error = ref(null);

		const passwordMatchRule = (v: string) => {
			return v === valuePassword.value || messagePasswordMismatch.value;
		};

		watch(loginModalVisible, (newValue) => {
			if(!newValue) {
				valueUsername.value = '';
				valuePassword.value = '';
				valuePassword2.value = '';
				valueCode.value = '';
			}
		});

		const register = async () => {
			error.value = null;

			const {valid} = await form.value!.validate();
			invalid.value = !valid;

			if(invalid.value) {
				return;
			}

			try {
				submitting.value = true;

				await store.dispatch(ActionTypes.REGISTER, {
					username: valueUsername.value,
					password: valuePassword.value,
					code: valueCode.value,
				});

				store.commit(MutationTypes.HIDE_UI_MODAL, 'login');
			} catch(e: any) {
				error.value = e;
			} finally {
				submitting.value = false;
			}
		}

		return {
			form,

			messageHeading,
			messageDescription,
			messageUsernameLabel,
			messagePasswordLabel,
			messageConfirmPasswordLabel,
			messageRegisterCodeLabel,
			messageSubmit,

			valueUsername,
			valuePassword,
			valuePassword2,
			valueCode,

			submitting,
			invalid,
			error,

			passwordMatchRule,
			register
		};
	}
});
</script>

<style lang="scss" scoped>
.form {
	h3 {
		margin-bottom: 0.5rem;
	}

	.form__description {
		white-space: pre-line;
		margin-bottom: 1.2rem;
		font-size: 1.4rem;
		color: var(--text-subtle);
	}
}
</style>
