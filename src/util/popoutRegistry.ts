/*
 * Copyright 2026 LiveAtlas Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import {Ref} from "vue";

// Tiny shared registry so the bottomleft popouts (Tools, Share) can ask
// each other to collapse when one is opened. Each component registers
// its `expanded` ref on mount and calls closeOthers() when its toggle
// transitions to open — the next popout to open then writes `false`
// into every other registered ref it finds.
const registered = new Set<Ref<boolean>>();

export const registerPopout = (expanded: Ref<boolean>): (() => void) => {
	registered.add(expanded);
	return () => registered.delete(expanded);
};

export const closeOtherPopouts = (current: Ref<boolean>): void => {
	for(const ref of registered) {
		if(ref !== current && ref.value) {
			ref.value = false;
		}
	}
};
