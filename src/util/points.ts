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

import {LiveAtlasPointMarker} from "@/index";
import {GenericIcon} from "@/leaflet/icon/GenericIcon";
import {GenericMarker} from "@/leaflet/marker/GenericMarker";
import {CanvasIconMarker} from "@/leaflet/marker/CanvasIconMarker";
import {refreshPopup} from "@/util/paths";

export type PointLayer = GenericMarker | CanvasIconMarker;

/**
 * Creates a {@link GenericMarker} with the given options
 * @param {LiveAtlasPointMarker} options Marker options
 * @param {Function} converter Function for projecting the marker location onto the map
 * @return The created GenericMarker
 */
export const createPointLayer = (options: LiveAtlasPointMarker, converter: Function, canvas = false): PointLayer => {
	// Drawn on the shared icon canvas unless asked for an HTML marker: sets whose labels are always
	// shown need those, as labels can hold HTML
	if (canvas) {
		const icon = new CanvasIconMarker(converter(options.location), options);

		if (options.popup) {
			icon.bindPopup(() => createPopup(options));
		}

		return icon;
	}

	const marker = new GenericMarker(converter(options.location), options);

	if (options.popup) {
		marker.bindPopup(() => createPopup(options));
		bindLabelSuppression(marker);
	}

	return marker;
};

/**
 * Updates or creates a {@link GenericMarker} with the given options
 * @param {?GenericMarker} marker Optional existing GenericMarker to update
 * @param {LiveAtlasPointMarker} options Marker options
 * @param {Function} converter Function for projecting the marker location onto the map
 * @returns The created or updated GenericMarker
 */
export const updatePointLayer = (marker: PointLayer | undefined, options: LiveAtlasPointMarker, converter: Function, canvas = false): PointLayer => {
	if (!marker) {
		return createPointLayer(options, converter, canvas);
	}

	const oldLocation = marker.getLatLng(),
		newLocation = converter(options.location);

	if(!oldLocation.equals(newLocation)) {
		marker.setLatLng(newLocation);
	}

	if(marker instanceof CanvasIconMarker) {
		marker.update(options);
		refreshPopup(marker, options.popup, () => createPopup(options));

		return marker;
	}

	if(marker instanceof GenericMarker) {
		const icon = marker.getIcon();

		if(icon && icon instanceof GenericIcon) {
			icon.update({
				iconUrl: options.iconUrl,
				label: options.tooltipHTML || options.tooltip,
				iconSize: options.iconSize,
				iconAnchor: options.iconAnchor,
				isHtml: !!options.tooltipHTML,
			});
		}
	}

	refreshPopup(marker, options.popup, () => createPopup(options), () => bindLabelSuppression(marker));

	return marker;
};

/**
 * Creates a popup element for the given marker
 * @param {LiveAtlasPointMarker} options Marker options
 * @returns {HTMLSpanElement} The marker element
 * @private
 */
const createPopup = (options: LiveAtlasPointMarker) => {
	const popup = document.createElement('span');

	if (options.popup) {
		popup.classList.add('MarkerPopup');
		popup.insertAdjacentHTML('afterbegin', options.popup);
	}

	return popup;
};

// The point marker's inline label (rendered by GenericIcon) is shown via
// the .marker:hover/:focus CSS rule and overlaps with the click popup if
// both are visible. Toggle a class on the marker element so CSS can
// suppress the label while the popup is open.
//
// `off` first so re-binding during updatePointLayer doesn't accumulate
// duplicate listeners across marker updates.
const bindLabelSuppression = (marker: GenericMarker): void => {
	marker.off('popupopen').on('popupopen', () => marker.getElement()?.classList.add('marker--popup-open'));
	marker.off('popupclose').on('popupclose', () => marker.getElement()?.classList.remove('marker--popup-open'));
};
