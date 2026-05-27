/*
 * Copyright 2026 LiveAtlas Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import {Control, ControlOptions, DomEvent, DomUtil} from 'leaflet';
import {useStore} from "@/store";
import {MutationTypes} from "@/store/mutation-types";
import {LiveAtlasLocation} from "@/index";

// Pulls every signed (optionally decimal) number out of a free-form coord
// string. Accepts the formats users typically paste from chat:
//   "100 -200", "100, -200", "100 64 -200", "[100, 64, -200]", "x=100 z=-200".
// Returns null if fewer than 2 or more than 3 numbers are found — the form
// shows a brief error state when that happens.
const parseCoords = (raw: string): LiveAtlasLocation | null => {
	const matches = raw.match(/-?\d+(?:\.\d+)?/g);
	if(!matches) return null;
	const nums = matches.map(Number).filter(n => !Number.isNaN(n));
	if(nums.length === 2) {
		return {x: nums[0], y: 64, z: nums[1]};
	}
	if(nums.length === 3) {
		return {x: nums[0], y: nums[1], z: nums[2]};
	}
	return null;
};

export class GotoCoordinatesControl extends Control {
	declare options: ControlOptions;

	constructor(options: ControlOptions) {
		super(options);
	}

	onAdd() {
		const store = useStore();

		const form = DomUtil.create('form',
			'leaflet-control-goto') as HTMLFormElement;
		form.setAttribute('role', 'search');

		const input = DomUtil.create('input',
			'leaflet-control-goto__input', form) as HTMLInputElement;
		input.type = 'text';
		input.placeholder = 'Go to: X Z';
		input.title = 'Jump to coordinates (X Z or X Y Z)';
		input.setAttribute('aria-label', 'Jump to coordinates');
		input.spellcheck = false;
		input.autocomplete = 'off';

		const button = DomUtil.create('button',
			'leaflet-control-goto__button', form) as HTMLButtonElement;
		button.type = 'submit';
		button.title = 'Jump to coordinates';
		button.setAttribute('aria-label', 'Jump');
		button.innerHTML = `
			<svg class="svg-icon" aria-hidden="true">
			  <use xlink:href="#icon--link" />
			</svg>`;

		// Stop Leaflet from treating clicks/scrolls/keypresses on the form
		// as map interactions (drag-pan, zoom, etc).
		DomEvent.disableClickPropagation(form);
		DomEvent.disableScrollPropagation(form);
		form.addEventListener('keydown', e => e.stopPropagation());

		form.addEventListener('submit', e => {
			e.preventDefault();
			const location = parseCoords(input.value);
			if(!location) {
				form.classList.add('leaflet-control-goto--invalid');
				window.setTimeout(() => form.classList.remove('leaflet-control-goto--invalid'), 500);
				return;
			}
			store.commit(MutationTypes.SET_VIEW_TARGET, {location});
			input.blur();
		});

		return form;
	}
}
