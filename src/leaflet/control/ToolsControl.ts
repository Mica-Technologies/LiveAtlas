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

export interface ToolsControlOptions extends ControlOptions {
	onToggleExpanded: () => void;
	onGotoSubmit: (raw: string, form: HTMLFormElement) => void;
	onMeasureToggle: () => void;
}

/**
 * Collapsible bottomleft control housing the goto-coordinates input and
 * the measure-distance toggle. The Vue wrapper drives state via
 * `setExpanded` / `setMeasureActive` / `setMeasureStatus`; this class
 * only owns the DOM and forwards user input back through the callbacks
 * in {@link ToolsControlOptions}.
 *
 * Lives at bottomleft so it stays out of the top region embedding hosts
 * cover with a translucent menu bar.
 */
export class ToolsControl extends Control {
	declare options: ToolsControlOptions;

	private container?: HTMLDivElement;
	private body?: HTMLDivElement;
	private toggleBtn?: HTMLButtonElement;
	private measureBtn?: HTMLButtonElement;
	private measureStatus?: HTMLDivElement;
	private gotoInput?: HTMLInputElement;
	private gotoForm?: HTMLFormElement;

	constructor(options: ToolsControlOptions) {
		super(options);
	}

	onAdd() {
		const container = DomUtil.create('div',
			'popout-control tools-control') as HTMLDivElement;
		this.container = container;
		DomEvent.disableClickPropagation(container);
		DomEvent.disableScrollPropagation(container);

		// Body sits ABOVE the toggle via flex column-reverse, so it grows
		// upward from the corner.
		const body = DomUtil.create('div', 'popout-control__body', container) as HTMLDivElement;
		this.body = body;

		// Go-to coordinates row
		const gotoForm = DomUtil.create('form', 'tools-control__goto', body) as HTMLFormElement;
		gotoForm.setAttribute('role', 'search');
		const gotoInput = DomUtil.create('input', 'tools-control__goto-input', gotoForm) as HTMLInputElement;
		gotoInput.type = 'text';
		gotoInput.placeholder = 'Go to: X Z';
		gotoInput.title = 'Jump to coordinates (X Z or X Y Z)';
		gotoInput.setAttribute('aria-label', 'Jump to coordinates');
		gotoInput.spellcheck = false;
		gotoInput.autocomplete = 'off';
		const gotoGo = DomUtil.create('button', 'tools-control__goto-button', gotoForm) as HTMLButtonElement;
		gotoGo.type = 'submit';
		gotoGo.title = 'Jump to coordinates';
		gotoGo.setAttribute('aria-label', 'Jump');
		gotoGo.innerHTML = `<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--arrow" /></svg>`;
		gotoForm.addEventListener('submit', e => {
			e.preventDefault();
			this.options.onGotoSubmit(gotoInput.value, gotoForm);
		});
		gotoForm.addEventListener('keydown', e => e.stopPropagation());
		this.gotoInput = gotoInput;
		this.gotoForm = gotoForm;

		// Single action row: just measure now (screenshot moved to the
		// share control's popout).
		const actions = DomUtil.create('div', 'popout-control__actions', body) as HTMLDivElement;
		const measureBtn = DomUtil.create('button', 'popout-control__action', actions) as HTMLButtonElement;
		measureBtn.type = 'button';
		measureBtn.title = 'Measure distance';
		measureBtn.setAttribute('aria-label', 'Measure distance');
		measureBtn.setAttribute('aria-pressed', 'false');
		measureBtn.innerHTML = `
			<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--marker_line" /></svg>
			<span>Measure</span>`;
		measureBtn.addEventListener('click', e => {
			e.preventDefault();
			this.options.onMeasureToggle();
		});
		this.measureBtn = measureBtn;

		const measureStatus = DomUtil.create('div',
			'popout-control__status', body) as HTMLDivElement;
		measureStatus.hidden = true;
		this.measureStatus = measureStatus;

		const toggleBtn = DomUtil.create('button',
			'leaflet-control-button popout-control__toggle', container) as HTMLButtonElement;
		toggleBtn.type = 'button';
		toggleBtn.title = 'Tools';
		toggleBtn.setAttribute('aria-label', 'Tools');
		toggleBtn.setAttribute('aria-expanded', 'false');
		toggleBtn.innerHTML = `<svg class="svg-icon" aria-hidden="true"><use xlink:href="#icon--tools" /></svg>`;
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

	setMeasureActive(active: boolean): void {
		if(!this.measureBtn || !this.measureStatus) return;
		this.measureBtn.setAttribute('aria-pressed', String(active));
		this.measureBtn.classList.toggle('popout-control__action--active', active);
		this.measureStatus.hidden = !active;
	}

	setMeasureStatus(text: string, hint: string): void {
		if(!this.measureStatus) return;
		this.measureStatus.innerHTML = `
			<span class="popout-control__status-total">${text}</span>
			<span class="popout-control__status-hint">${hint}</span>`;
	}

	focusGotoInput(): void {
		this.gotoInput?.focus();
	}

	flashGotoInvalid(): void {
		if(!this.gotoForm) return;
		this.gotoForm.classList.add('tools-control__goto--invalid');
		window.setTimeout(() =>
			this.gotoForm?.classList.remove('tools-control__goto--invalid'), 500);
	}

	clearGotoInput(): void {
		if(this.gotoInput) this.gotoInput.value = '';
	}
}
