<!--
  - Copyright 2022 James Lyne
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  - http://www.apache.org/licenses/LICENSE-2.0
  -->

<script lang="ts">
import {defineComponent, nextTick, onMounted, onUnmounted, ref, watch} from "vue";
import {toClipboard} from "@soerenmartius/vue3-clipboard";
import {notify} from "@kyvg/vue3-notification";
import {LinkControl} from "@/leaflet/control/LinkControl";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";
import {useStore} from "@/store";
import {clipboardError, clipboardSuccess} from "@/util";
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
		const expanded = ref(false);

		const embedBaseUrl = new URLSearchParams(window.location.search).get('embedBaseUrl');
		const onCopySuccess = clipboardSuccess(store);
		const onCopyError = clipboardError(store);

		const onCopyLink = () => {
			const base = embedBaseUrl || window.location.href.split("#")[0];
			toClipboard(base + store.getters.url)
				.then(onCopySuccess)
				.catch(onCopyError);
			expanded.value = false;
		};

		const onSaveImage = async () => {
			expanded.value = false;
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

		const control = new LinkControl({
			position: 'bottomleft',
			onToggleExpanded: () => expanded.value = !expanded.value,
			onCopyLink,
			onSaveImage,
		});

		watch(expanded, v => control.setExpanded(v));

		onMounted(() => {
			props.leaflet.addControl(control);

			// Same as ToolsControl — Leaflet prepends to bottom corners, so
			// without intervention this lands at the top of the column. We
			// want it below the zoom buttons, and if the Tools toggle is
			// already in place, below that too (so Tools stays the first
			// thing under +/-).
			void nextTick(() => {
				const myEl = control.getContainer();
				const corner = myEl?.parentElement;
				if(!myEl || !corner) return;
				const toolsEl = corner.querySelector(':scope > .tools-control') as HTMLElement | null;
				const zoomEl = corner.querySelector(':scope > .leaflet-control-zoom') as HTMLElement | null;
				const anchor = toolsEl || zoomEl;
				if(anchor) {
					corner.insertBefore(myEl, anchor.nextSibling);
				}
			});
		});
		onUnmounted(() => props.leaflet.removeControl(control));
	},

	render() {
		return null;
	}
})
</script>
