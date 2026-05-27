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

export interface ScreenshotControlOptions extends ControlOptions {
	onClick: () => void;
}

export class ScreenshotControl extends Control {
	declare options: ScreenshotControlOptions;

	constructor(options: ScreenshotControlOptions) {
		super(options);
	}

	onAdd() {
		const button = DomUtil.create('button',
			'leaflet-control-button leaflet-control-screenshot') as HTMLButtonElement;
		button.type = 'button';
		button.title = 'Save map view as image';
		button.setAttribute('aria-label', 'Save map view as image');
		button.innerHTML = `
			<svg class="svg-icon" aria-hidden="true">
			  <use xlink:href="#icon--link" />
			</svg>`;

		DomEvent.disableClickPropagation(button);
		button.addEventListener('click', e => {
			e.preventDefault();
			this.options.onClick();
		});

		return button;
	}
}
