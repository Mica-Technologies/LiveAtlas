/*
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

import {ref} from "vue";

export interface ZoomLimits {
	minZoom?: number;
	maxZoom?: number;
}

/** Whether either zoom limit is set. 0 is a real limit, so this can't test for truthiness. */
export const hasZoomLimits = (limits?: ZoomLimits): boolean =>
	!!limits && (limits.minZoom !== undefined || limits.maxZoom !== undefined);

/**
 * Whether something with the given zoom limits shows at the given zoom. A layer's own limits take
 * precedence over its group's, so a marker can show at zoom levels its set as a whole does not.
 */
export const isVisibleAtZoom = (zoom: number, layerLimits?: ZoomLimits, groupLimits?: ZoomLimits): boolean => {
	const limits = hasZoomLimits(layerLimits) ? layerLimits! : groupLimits;

	if(!limits) {
		return true;
	}

	return (limits.minZoom === undefined || zoom >= limits.minZoom)
		&& (limits.maxZoom === undefined || zoom <= limits.maxZoom);
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Whether a point lies inside the given bounds, edges included. */
export const isInBounds = (x: number, y: number, bounds: Bounds): boolean =>
	x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

/**
 * Number of point markers that are due to be shown but not yet added to the map. Marker layer
 * groups add markers a few at a time so a big set can't freeze the page; the loading indicator
 * watches this to say markers are still on their way.
 */
export const pendingMarkerCount = ref(0);

/** Whether the marker data for the current world is being fetched or processed. */
export const markersFetching = ref(false);
