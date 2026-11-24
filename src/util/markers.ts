/*
 * Copyright 2022 James Lyne
 *
 * Some portions of this file were taken from https://github.com/webbukkit/dynmap.
 * These portions are Copyright 2020 Dynmap Contributors.
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

import {ComputedRef, computed, watch, WatchStopHandle} from "vue";
import {Layer} from "leaflet";
import {
	LiveAtlasAreaMarker,
	LiveAtlasCircleMarker,
	LiveAtlasLineMarker,
	LiveAtlasMarker,
	LiveAtlasPointMarker
} from "@/index";
import {DynmapMarkerUpdate} from "@/dynmap";
import {useStore} from "@/store";
import {ActionTypes} from "@/store/action-types";
import {createCircleLayer, updateCircleLayer} from "@/util/circles";
import {createPointLayer, PointLayer, updatePointLayer} from "@/util/points";
import {createAreaLayer, updateAreaLayer} from "@/util/areas";
import {createLineLayer, updateLineLayer} from "@/util/lines";
import LiveAtlasPolygon from "@/leaflet/vector/LiveAtlasPolygon";
import LiveAtlasPolyline from "@/leaflet/vector/LiveAtlasPolyline";

export type LiveAtlasMarkerUpdateCallback = ((update: DynmapMarkerUpdate) => void);

export enum LiveAtlasMarkerType {
	POINT,
	AREA,
	LINE,
	CIRCLE
}

let updateFrame = 0;
let pendingUpdates: ComputedRef;
let stopWatching: WatchStopHandle | undefined;

const updateHandlers: Set<LiveAtlasMarkerUpdateCallback> = new Set();
const setUpdateHandlers: { [key:string]: Set<LiveAtlasMarkerUpdateCallback>} = {};

/**
 * Starts handling of pending marker updates
 */
export const startUpdateHandling = () => {
	const store = useStore();

	// Called again on each server or world change, so drop the previous watcher rather than adding one
	stopWatching?.();
	pendingUpdates = computed(() => store.state.pendingMarkerUpdates.length);

	stopWatching = watch(pendingUpdates, (newValue, oldValue) => {
		if(newValue && newValue > 0 && oldValue === 0 && !updateFrame) {
			updateFrame = requestAnimationFrame(() => handlePendingUpdates());
		}
	});
}

/**
 * Stops handling of pending marker updates
 */
export const stopUpdateHandling = () => {
	if(updateFrame) {
		cancelAnimationFrame(updateFrame);
		updateFrame = 0;
	}
}

/**
 * Registers the given callback as a global handler for marker updates
 * @param {LiveAtlasMarkerUpdateCallback} callback The callback
 */
export const registerUpdateHandler = (callback: LiveAtlasMarkerUpdateCallback) => {
	updateHandlers.add(callback);
}

/**
 * Unregisters the given callback as a global handler for marker updates
 * @param {LiveAtlasMarkerUpdateCallback} callback The callback
 */
export const unregisterUpdateHandler = (callback: LiveAtlasMarkerUpdateCallback) => {
	updateHandlers.delete(callback);
}

/**
 * Registers the given callback as a handler for marker updates in the given marker set
 * @param {LiveAtlasMarkerUpdateCallback} callback The callback
 * @param {string} set: The marker set id
 */
export const registerSetUpdateHandler = (callback: LiveAtlasMarkerUpdateCallback, set: string) => {
	if(!setUpdateHandlers[set]) {
		setUpdateHandlers[set] = new Set();
	}

	setUpdateHandlers[set].add(callback);
}

/**
 * Unregisters the given callback as a handler for marker updates in the given marker set
 * @param {LiveAtlasMarkerUpdateCallback} callback The callback
 * @param {string} set: The marker set id
 */
export const unregisterSetUpdateHandler = (callback: LiveAtlasMarkerUpdateCallback, set: string) => {
	if(!setUpdateHandlers[set]) {
		return;
	}

	setUpdateHandlers[set].delete(callback);
}

/** Time each frame may spend applying marker updates, so a backlog clears in a few frames without stutter. */
const UPDATE_FRAME_BUDGET_MS = 8;
const UPDATE_BATCH = 10;

/**
 * Handles pending marker updates, if any exist
 * Updates are taken from the list in batches of 10 and passed to the registered update handlers until
 * the frame's time budget is spent. If further updates remain, an animation frame is scheduled for them.
 * @private
 */
const handlePendingUpdates = async () => {
	const store = useStore(),
		start = performance.now();

	// A handler that throws must not stop marker updates for good: the next frame is always
	// scheduled (or the frame id cleared, so new updates start a frame again)
	try {
		do {
			const updates = await store.dispatch(ActionTypes.POP_MARKER_UPDATES, UPDATE_BATCH);

			for(const update of updates) {
				const handle = (callback: LiveAtlasMarkerUpdateCallback) => {
					try {
						callback(update);
					} catch(e) {
						console.error('Failed to apply marker update', update, e);
					}
				};

				updateHandlers.forEach(handle);
				setUpdateHandlers[update.set]?.forEach(handle);
			}
		} while(pendingUpdates.value && performance.now() - start < UPDATE_FRAME_BUDGET_MS);
	} finally {
		if(pendingUpdates.value) {
			updateFrame = requestAnimationFrame(() => handlePendingUpdates());
		} else {
			updateFrame = 0;
		}
	}
};

/**
 * Creates the appropriate type of marker layer for the given {@link LiveAtlasMarker}
 * @param {LiveAtlasMarker} options Marker options
 * @param {Function} converter Function for projecting the marker location onto the map
 * @returns The created layer
 * @see createPointLayer
 * @see createAreaLayer
 * @see createCircleLayer
 * @see createLineLayer
 */
export const createMarkerLayer = (options: LiveAtlasMarker, converter: Function, canvasIcons = false): Layer => {
	switch(options.type) {
		case LiveAtlasMarkerType.POINT:
			return createPointLayer(options as LiveAtlasPointMarker, converter, canvasIcons);
		case LiveAtlasMarkerType.AREA:
			return createAreaLayer(options as LiveAtlasAreaMarker, converter);
		case LiveAtlasMarkerType.LINE:
			return createLineLayer(options as LiveAtlasLineMarker, converter);
		case LiveAtlasMarkerType.CIRCLE:
			return createCircleLayer(options as LiveAtlasCircleMarker, converter);
	}
}

/**
 * Updates or creates an appropriate type of marker layer with the given options
 * @param {?Layer} marker Optional existing marker layer to update
 * @param {?LiveAtlasMarker} options Marker options
 * @param {Function} converter Function for projecting the marker location onto the map
 * @returns The created layer
 * @see updatePointLayer
 * @see updateAreaLayer
 * @see updateCircleLayer
 * @see updateLineLayer
 */
export const updateMarkerLayer = (marker: Layer | undefined, options: LiveAtlasMarker, converter: Function, canvasIcons = false): Layer => {
	let layer: Layer | undefined;

	switch(options.type) {
		case LiveAtlasMarkerType.POINT:
			layer = updatePointLayer(marker as PointLayer, options as LiveAtlasPointMarker, converter, canvasIcons);
			break;
		case LiveAtlasMarkerType.AREA:
			layer = updateAreaLayer(marker as LiveAtlasPolygon | LiveAtlasPolyline, options as LiveAtlasAreaMarker, converter);
			break;
		case LiveAtlasMarkerType.LINE:
			layer = updateLineLayer(marker as LiveAtlasPolyline, options as LiveAtlasLineMarker, converter);
			break;
		case LiveAtlasMarkerType.CIRCLE:
			layer = updateCircleLayer(marker as LiveAtlasPolyline | LiveAtlasPolygon, options as LiveAtlasCircleMarker, converter);
			break;
	}

	// The zoom limits can change too, and the layer group reads them from the layer's options
	const layerOptions = (layer as any)?.options;

	if(layerOptions) {
		layerOptions.minZoom = options.minZoom;
		layerOptions.maxZoom = options.maxZoom;
	}

	return layer as Layer;
}
