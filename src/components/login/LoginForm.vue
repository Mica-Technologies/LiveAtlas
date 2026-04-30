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
	<v-form :class="{'form': true, 'form--invalid': invalid}" @submit.prevent="login" ref="form" fast-fail>
		<h3>{{ loginHeading }}</h3>

		<v-text-field
			id="login-username"
			v-model="loginUsername"
			:label="usernameLabel"
			type="text"
			name="username"
			autocomplete="username"
			variant="outlined"
			density="compact"
			required
			:rules="[v => !!v || '']"
			ref="usernameField"
		/>

		<v-text-field
			id="login-password"
			v-model="loginPassword"
			:label="passwordLabel"
			type="password"
			name="password"
			autocomplete="current-password"
			variant="outlined"
			density="compact"
			required
			:rules="[v => !!v || '']"
		/>

		<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>

		<v-btn type="submit" :disabled="submitting" :loading="submitting" color="primary" block>{{ loginSubmit }}</v-btn>
	</v-form>
</template>

<script lang="ts">
import {defineComponent, onMounted, computed, nextTick, ref, watchEffect} from "vue";
import {notify} from "@kyvg/vue3-notification";
import {useStore} from "@/store";
import {ActionTypes} from "@/store/action-types";
import {MutationTypes} from "@/store/mutation-types";

export default defineComponent({
	setup() {
		const store = useStore(),
			form = ref<InstanceType<typeof import('vuetify/components').VForm> | null>(null),
			usernameField = ref<InstanceType<typeof import('vuetify/components').VTextField> | null>(null),

			loginModalVisible = computed(() => store.state.ui.visibleModal === 'login'),

			loginHeading = computed(() => store.state.messages.loginHeading),
			usernameLabel = computed(() => store.state.messages.loginUsernameLabel),
			passwordLabel = computed(() => store.state.messages.loginPasswordLabel),
			loginSubmit = computed(() => store.state.messages.loginSubmit),
			loginSuccess = computed(() => store.state.messages.loginSuccess),

			loginUsername = ref(''),
			loginPassword = ref(''),

			submitting = ref(false),
			invalid = ref(false),
			error = ref(null);

		onMounted(() => {
			watchEffect(async () => {
				await nextTick();

				if(loginModalVisible.value) {
					usernameField.value?.focus();
				} else {
					loginUsername.value = '';
					loginPassword.value = '';
				}
			});
		});

		const login = async () => {
			error.value = null;

			const {valid} = await form.value!.validate();
			invalid.value = !valid;

			if(invalid.value) {
				return;
			}

			try {
				submitting.value = true;

				await store.dispatch(ActionTypes.LOGIN, {
					username: loginUsername.value,
					password: loginPassword.value,
				});

				store.commit(MutationTypes.HIDE_UI_MODAL, 'login');
				notify(loginSuccess.value);
			} catch(e: any) {
				error.value = e;
			} finally {
				submitting.value = false;
			}
		};
		return {
			form,
			usernameField,

			loginHeading,
			usernameLabel,
			passwordLabel,
			loginSubmit,

			loginUsername,
			loginPassword,

			submitting,
			invalid,
			error,

			login,
		};
	}
});
</script>

<style lang="scss" scoped>
.form {
	h3 {
		margin-bottom: 1.2rem;
	}
}
</style>
