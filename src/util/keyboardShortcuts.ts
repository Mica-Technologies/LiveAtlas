/*
 * Copyright 2026 LiveAtlas Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import {Store} from "vuex";
import {State} from "@/store/state";
import {MutationTypes} from "@/store/mutation-types";

// Shortcuts must not fire when the user is typing into an input — that's
// what makes "/" focus search elsewhere but stays as the regular slash
// character when the cursor is already in a field.
const isTypingInInput = (target: EventTarget | null): boolean => {
	if(!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if(target.isContentEditable) return true;
	return false;
};

const focusElement = (selector: string): boolean => {
	const el = document.querySelector(selector) as HTMLElement | null;
	if(!el) return false;
	el.focus();
	// Inputs nested inside Vuetify wrappers (e.g. v-text-field) need their
	// inner <input> focused, not the outer container — fall through to it
	// if the matched node has one.
	if(!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
		const inner = el.querySelector('input, textarea') as HTMLElement | null;
		inner?.focus();
	}
	return document.activeElement !== document.body;
};

export const registerKeyboardShortcuts = (store: Store<State>): void => {
	window.addEventListener('keydown', (e) => {
		// Modifier-key combos belong to the browser/OS, not to us.
		if(e.ctrlKey || e.metaKey || e.altKey) return;
		if(isTypingInInput(e.target)) return;

		switch(e.key) {
			case '/': {
				// Make the markers sidebar visible first; the search input
				// only mounts when the section is rendered.
				if(!store.state.ui.visibleElements.has('markers')) {
					store.commit(MutationTypes.SET_UI_ELEMENT_VISIBILITY, {
						element: 'markers',
						state: true,
					});
				}
				// Defer until Vue has rendered the section.
				window.requestAnimationFrame(() => {
					if(focusElement('#markers__search')) {
						e.preventDefault();
					}
				});
				e.preventDefault();
				break;
			}
			case 'g':
			case 'G': {
				// The tools panel collapses by default — expand it first
				// so the input is mounted, then focus on the next frame.
				const panel = document.querySelector('.tools-control');
				if(panel && !panel.classList.contains('popout-control--expanded')) {
					(panel.querySelector('.popout-control__toggle') as HTMLElement | null)?.click();
				}
				window.requestAnimationFrame(() => {
					focusElement('.tools-control__goto-input');
				});
				e.preventDefault();
				break;
			}
			case 'b':
			case 'B': {
				store.commit(MutationTypes.SHOW_UI_MODAL, 'bookmarks');
				e.preventDefault();
				break;
			}
			case '?': {
				store.commit(MutationTypes.SHOW_UI_MODAL, 'shortcuts');
				e.preventDefault();
				break;
			}
			case 'Escape': {
				if(store.state.ui.visibleModal) {
					store.commit(MutationTypes.HIDE_UI_MODAL, store.state.ui.visibleModal);
					e.preventDefault();
				}
				break;
			}
		}
	});
};
