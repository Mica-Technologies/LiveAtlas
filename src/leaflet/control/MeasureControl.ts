/*
 * Copyright 2026 LiveAtlas Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import {Control, ControlOptions, DomUtil, DomEvent} from 'leaflet';

export interface MeasureControlOptions extends ControlOptions {
	onToggle: () => void;
}

/**
 * Toggle button that flips the map between idle and measurement mode.
 * The Vue wrapper owns the actual measuring state, polyline, and click
 * listeners — this control just exposes a button and lets the wrapper
 * update its visual state via {@link setActive}.
 */
export class MeasureControl extends Control {
	declare options: MeasureControlOptions;

	private button?: HTMLButtonElement;

	constructor(options: MeasureControlOptions) {
		super(options);
	}

	onAdd() {
		const button = DomUtil.create('button',
			'leaflet-control-button leaflet-control-measure') as HTMLButtonElement;
		button.type = 'button';
		button.title = 'Measure distance';
		button.setAttribute('aria-label', 'Measure distance');
		button.setAttribute('aria-pressed', 'false');
		button.innerHTML = `
			<svg class="svg-icon" aria-hidden="true">
			  <use xlink:href="#icon--link" />
			</svg>`;

		DomEvent.disableClickPropagation(button);
		button.addEventListener('click', e => {
			e.preventDefault();
			this.options.onToggle();
		});

		this.button = button;
		return button;
	}

	setActive(active: boolean): void {
		if(!this.button) return;
		this.button.setAttribute('aria-pressed', String(active));
		this.button.classList.toggle('leaflet-control-measure--active', active);
	}
}
