<!--
  - Copyright 2026 LiveAtlas Contributors
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -->

<script lang="ts">
import {defineComponent, onMounted, onUnmounted} from "vue";
import {notify} from "@kyvg/vue3-notification";
import {ScreenshotControl} from "@/leaflet/control/ScreenshotControl";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import {useStore} from "@/store";
import {captureMapScreenshot, downloadBlob} from "@/util/screenshot";

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		}
	},

	setup(props) {
		const store = useStore();

		const onClick = async () => {
			try {
				const result = await captureMapScreenshot(props.leaflet.getContainer());
				const world = store.state.currentWorld?.name || 'world';
				const stamp = new Date().toISOString().replace(/[:.]/g, '-');
				downloadBlob(result.blob, `liveatlas-${world}-${stamp}.png`);
				if(result.corsTainted) {
					notify({
						type: 'warn',
						title: 'Partial screenshot',
						text: 'Some tiles or icons could not be captured (cross-origin).',
					});
				}
			} catch (err) {
				notify({
					type: 'error',
					title: 'Screenshot failed',
					text: (err instanceof Error ? err.message : String(err)),
				});
			}
		};

		const control = new ScreenshotControl({
			position: 'topleft',
			onClick,
		});

		onMounted(() => props.leaflet.addControl(control));
		onUnmounted(() => props.leaflet.removeControl(control));
	},

	render() {
		return null;
	}
});
</script>
