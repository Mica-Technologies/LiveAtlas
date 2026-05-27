/*
 * Copyright 2022 James Lyne
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import {Control, ControlOptions, DomEvent, DomUtil} from 'leaflet';

export interface LinkControlOptions extends ControlOptions {
	onToggleExpanded: () => void;
	onCopyLink: () => void;
	onSaveImage: () => void;
}

/**
 * Bottomleft "share" popout combining the previous copy-link button with
 * the screenshot action. Follows the same expand-on-click pattern as
 * {@link ../control/ToolsControl}: a single toggle button that matches
 * the standard Leaflet control button, plus a body that flips out above
 * it when expanded.
 */
export class LinkControl extends Control {
	declare options: LinkControlOptions;

	private container?: HTMLDivElement;
	private body?: HTMLDivElement;
	private toggleBtn?: HTMLButtonElement;

	constructor(options: LinkControlOptions) {
		super(options);
	}

	onAdd() {
		const container = DomUtil.create('div',
			'popout-control link-control') as HTMLDivElement;
		this.container = container;
		DomEvent.disableClickPropagation(container);
		DomEvent.disableScrollPropagation(container);

		const body = DomUtil.create('div', 'popout-control__body', container) as HTMLDivElement;
		this.body = body;

		const actions = DomUtil.create('div', 'popout-control__actions', body) as HTMLDivElement;

		const copyBtn = DomUtil.create('button', 'popout-control__action', actions) as HTMLButtonElement;
		copyBtn.type = 'button';
		copyBtn.title = 'Copy a shareable link to this view';
		copyBtn.setAttribute('aria-label', 'Copy link');
		copyBtn.innerHTML = `
			<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--link" /></svg>
			<span>Copy link</span>`;
		copyBtn.addEventListener('click', e => {
			e.preventDefault();
			this.options.onCopyLink();
		});

		const saveBtn = DomUtil.create('button', 'popout-control__action', actions) as HTMLButtonElement;
		saveBtn.type = 'button';
		saveBtn.title = 'Save the current map view as a PNG';
		saveBtn.setAttribute('aria-label', 'Save image');
		saveBtn.innerHTML = `
			<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--image" /></svg>
			<span>Save image</span>`;
		saveBtn.addEventListener('click', e => {
			e.preventDefault();
			this.options.onSaveImage();
		});

		const toggleBtn = DomUtil.create('button',
			'leaflet-control-button popout-control__toggle', container) as HTMLButtonElement;
		toggleBtn.type = 'button';
		toggleBtn.title = 'Share this view';
		toggleBtn.setAttribute('aria-label', 'Share this view');
		toggleBtn.setAttribute('aria-expanded', 'false');
		toggleBtn.innerHTML = `<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--link" /></svg>`;
		toggleBtn.addEventListener('click', e => {
			e.preventDefault();
			this.options.onToggleExpanded();
		});
		this.toggleBtn = toggleBtn;

		this.setExpanded(false);
		return container;
	}

	setExpanded(expanded: boolean): void {
		if(!this.container || !this.body || !this.toggleBtn) return;
		this.container.classList.toggle('popout-control--expanded', expanded);
		this.toggleBtn.setAttribute('aria-expanded', String(expanded));
		this.body.setAttribute('aria-hidden', String(!expanded));
	}
}
