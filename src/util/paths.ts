/*
 * Copyright 2022 James Lyne
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Content, Direction, LatLngExpression, Layer, PathOptions, TooltipOptions} from "leaflet";
import {LiveAtlasPathMarker} from "@/index";

export const tooltipOptions = {
	direction: 'top' as Direction,
	sticky: true,
	opacity: 1.0,
	interactive: false,
};

/**
 * Determines if the 2 given arrays of {@link LatLngExpression} are equal by comparing the JSON serialised representations
 * @param {LatLngExpression | LatLngExpression[] | LatLngExpression[][] | LatLngExpression[][][]} oldPoints Points to compare
 * @param {LatLngExpression | LatLngExpression[] | LatLngExpression[][] | LatLngExpression[][][]} newPoints Other points to compare
 * @return Whether both arrays of points are considered equal
 */
export const arePointsEqual = (oldPoints: LatLngExpression | LatLngExpression[] | LatLngExpression[][] | LatLngExpression[][][],
						newPoints: LatLngExpression | LatLngExpression[] | LatLngExpression[][] | LatLngExpression[][][]) => {
	return JSON.stringify(oldPoints) === JSON.stringify(newPoints);
}

/**
 * Determines if the 2 given {@link PathOptions} are equal by comapring their properties
 * @param {PathOptions} oldStyle PathOptions to compare
 * @param {PathOptions} newStyle Other PathOptions to compare
 * @return Whether both PathOptions are considered equal
 */
export const isStyleEqual = (oldStyle: PathOptions, newStyle: PathOptions) => {
	return oldStyle && newStyle
		&& (oldStyle.color === newStyle.color)
		&& (oldStyle.weight === newStyle.weight)
		&& (oldStyle.opacity === newStyle.opacity)
		&& (oldStyle.fillColor === newStyle.fillColor)
		&& (oldStyle.fillOpacity === newStyle.fillOpacity)
}

/**
 * Creates a popup element for the given marker
 * @param {LiveAtlasPointMarker} options Marker options
 * @param {string} className Classname to add to the popup element
 * @returns {HTMLSpanElement} The marker element
 */
/**
 * Refreshes a marker layer's popup after a marker update without closing it if it is open.
 *
 * Marker updates arrive every few seconds for moving markers (weather layers, players' claims
 * being edited, ...). Unbinding and rebinding the popup on each update closed it under the reader.
 * Instead the existing popup keeps its place and only its content is swapped, which Leaflet
 * re-renders in place if the popup is open, and only when the popup text actually changed.
 * @param layer The marker layer
 * @param source The popup source text (HTML or plain), or undefined for no popup
 * @param render Builds the popup element; called lazily by Leaflet when the popup is shown
 * @param onBind Called after a popup is first bound, for listeners that go with it
 */
export const refreshPopup = (layer: Layer, source: string | undefined, render: () => HTMLElement, onBind?: () => void): void => {
	const state = layer as Layer & {_liveAtlasPopupSource?: string};

	if (!source) {
		if (layer.getPopup()) {
			layer.closePopup();
			layer.unbindPopup();
		}
		state._liveAtlasPopupSource = undefined;
		return;
	}

	if (!layer.getPopup()) {
		layer.bindPopup(render);
		onBind?.();
	} else if (state._liveAtlasPopupSource !== source) {
		// Popup.setContent accepts a render function, as bindPopup does; it re-renders in place when open.
		layer.getPopup()!.setContent(render);
	}

	state._liveAtlasPopupSource = source;
};

export const createPopup = (options: LiveAtlasPathMarker, className: string): HTMLElement => {
	const popup = document.createElement('span');

	if(options.isPopupHTML) {
		popup.classList.add(className);
		popup.insertAdjacentHTML('afterbegin', options.popup as string);
	} else {
		popup.textContent = options.popup as string;
	}

	return popup;
};

// Keep the hover tooltip and the click popup from being on screen at the
// same time. The previous implementation just called closeTooltip() on
// popupopen, but on touch the event order is often:
//   1. tap → click → popup opens (handler runs, tooltip not open yet)
//   2. simulated mouseover fires later → tooltip opens
// leaving both visible. Instead, unbind the tooltip outright when the
// popup opens so it physically cannot appear, then rebind on popupclose
// using the saved content + options so the original hover behaviour
// returns afterward.
//
// `off()` first so re-binding during updateXLayer doesn't accumulate
// duplicate listeners across marker updates.
export const suppressTooltipWhilePopupOpen = (layer: Layer): void => {
	let saved: {content: Content; options: TooltipOptions} | null = null;

	const onPopupOpen = () => {
		const tt = layer.getTooltip();
		if(tt && !saved) {
			saved = {
				content: tt.getContent() as Content,
				options: {...tt.options},
			};
			layer.closeTooltip();
			layer.unbindTooltip();
		}
	};

	const onPopupClose = () => {
		if(saved) {
			layer.bindTooltip(saved.content, saved.options);
			saved = null;
		}
	};

	layer.off('popupopen').on('popupopen', onPopupOpen);
	layer.off('popupclose').on('popupclose', onPopupClose);
};
