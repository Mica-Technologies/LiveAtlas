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
import {GotoCoordinatesControl} from "@/leaflet/control/GotoCoordinatesControl";
import LiveAtlasLeafletMap from "@/leaflet/LiveAtlasLeafletMap";

export default defineComponent({
	props: {
		leaflet: {
			type: Object as () => LiveAtlasLeafletMap,
			required: true,
		}
	},

	setup(props) {
		const control = new GotoCoordinatesControl({
			position: 'topright',
		});

		onMounted(() => props.leaflet.addControl(control));
		onUnmounted(() => props.leaflet.removeControl(control));
	},

	render() {
		return null;
	}
});
</script>
