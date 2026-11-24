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

import {Layer, Map as LeafletMap, LayerGroup, LayerOptions, Util, Marker, Path, LatLngBounds} from "leaflet";
import {GenericMarker} from "@/leaflet/marker/GenericMarker";
import {CanvasIconMarker} from "@/leaflet/marker/CanvasIconMarker";
import {isInBounds, isVisibleAtZoom, pendingMarkerCount, Bounds} from "@/util/markerVisibility";

export interface LiveAtlasLayerGroupOptions extends LayerOptions {
	id: string; //Added to the name of layer group panes
	showLabels: boolean;
	priority: number; //Added to the z-index of layer group panes

	//Zoom limits for the whole group, can be overridden by layers
	minZoom?: number;
	maxZoom?: number;
}

/** How far beyond the visible map, as a fraction of its size, point markers are kept on the map. */
const VIEWPORT_PADDING = 0.25;

/** Time per frame spent adding markers, so a big set fills in over a few frames without stutter. */
const ADD_FRAME_BUDGET_MS = 6;

/**
 * A layer group for a marker set.
 *
 * Point markers are HTML elements, and a browser slows down sharply once a few thousand of them are
 * on the page: every repaint and every zoom has to walk all of them. So only the point markers in or
 * near the visible part of the map are added to it, and the rest are added as the map moves to them.
 * Markers that newly need showing are added a few at a time, nearest the centre of the view first,
 * so a dense area fills in over a few frames instead of freezing the page.
 *
 * Areas, lines, circles and canvas-drawn icons ({@link CanvasIconMarker}) are drawn on canvases
 * that only draw what is in view already, so they are only subject to zoom limits. The culling
 * applies to point markers that are HTML elements, which marker sets with always-visible labels use.
 */
export default class LiveAtlasLayerGroup extends LayerGroup {
	declare options: LiveAtlasLayerGroupOptions;
	declare _layers: any;

	private _markerPane?: HTMLElement;
	private _viewBounds?: Bounds;
	private _zoom = 0;
	private _addQueue: Layer[] = [];
	private _addFrame = 0;

	private _moveEndCallback = () => this.refresh();

	constructor(options: LiveAtlasLayerGroupOptions) {
		super([], options);
		Util.setOptions(this, options);
	}

	onAdd(map: LeafletMap) {
		map.on('moveend', this._moveEndCallback, this);

		this._map = map;
		this._markerPane = map.getPane(`${this.options.id}-markers`) || map.createPane(`${this.options.id}-markers`);

		this._markerPane.classList.toggle('leaflet-pane--show-labels', this.options.showLabels);

		this._markerPane.style.zIndex = (401 + this.options.priority).toString();

		this.refresh();

		return this;
	}

	onRemove(map: LeafletMap) {
		this._clearQueue();
		map.off('moveend', this._moveEndCallback, this);
		super.onRemove(map);

		return this;
	}

	clearLayers(): this {
		this._clearQueue();
		return super.clearLayers();
	}

	addLayer(layer: Layer) {
		const id = this.getLayerId(layer);

		this._layers[id] = layer;

		if (layer instanceof Marker) {
			layer.options.pane = `${this.options.id}-markers`;
		} else if (layer instanceof CanvasIconMarker) {
			layer.priority = this.options.priority;
		} else if (layer instanceof Path) {
			layer.options.pane = `vectors`;
		}

		if (this._map && this._shouldShow(layer)) {
			this._addToMap(layer);
		}

		return this;
	}

	removeLayer(layer: Layer): this {
		this._dequeue(layer);
		return super.removeLayer(layer);
	}

	/**
	 * Re-evaluates whether the given layer should be on the map, after its position or zoom limits
	 * have changed.
	 */
	refreshLayer(layer: Layer) {
		if(!this._map || !this.hasLayer(layer)) {
			return;
		}

		if(this._shouldShow(layer)) {
			if(!this._map.hasLayer(layer)) {
				this._dequeue(layer);
				this._addToMap(layer);
			}
		} else if(this._map.hasLayer(layer)) {
			this._removeFromMap(layer);
		}
	}

	update(options: LiveAtlasLayerGroupOptions) {
		if(this.options.showLabels !== options.showLabels) {
			this.eachLayer((layer) => {
				//Create labels on markers which are shown, others get them when they are added
				if(layer instanceof GenericMarker && this._map?.hasLayer(layer)) {
					if(options.showLabels) {
						(layer as GenericMarker).createLabel();
					} else {
						(layer as GenericMarker).removeLabel();
					}
				}
			});

			this.options.showLabels = options.showLabels;
		}

		if(this._markerPane) {
			this._markerPane.classList.toggle('leaflet-pane--show-labels', options.showLabels);
		}

		if(options.minZoom !== this.options.minZoom || options.maxZoom !== this.options.maxZoom) {
			this.options.minZoom = options.minZoom;
			this.options.maxZoom = options.maxZoom;

			this.refresh();
		}

		if(options.priority !== this.options.priority) {
			this.options.priority = options.priority;

			this.eachLayer(layer => {
				if(layer instanceof CanvasIconMarker) {
					layer.priority = options.priority;
					(layer as any)._renderer?.requestRedraw();
				}
			});

			if(this._markerPane) {
				this._markerPane.style.zIndex = (401 + this.options.priority).toString();
			}
		}
	}

	/**
	 * Brings the map in line with the current view: removes layers that should no longer show and
	 * queues those that now should. Runs after every move; call it after moving many layers at once.
	 */
	refresh() {
		if(!this._map) {
			return;
		}

		this._updateView();
		this._clearQueue();

		const toAdd: Layer[] = [];

		this.eachLayer((layer: Layer) => {
			const show = this._shouldShow(layer),
				onMap = this._map.hasLayer(layer);

			if(show && !onMap) {
				//Lines and areas are cheap to add, and drawn on a canvas which already culls them
				if(layer instanceof Marker) {
					toAdd.push(layer);
				} else {
					this._addToMap(layer);
				}
			} else if(!show && onMap) {
				this._removeFromMap(layer);
			}
		});

		if(toAdd.length) {
			const center = this._map.getCenter(),
				distance = (layer: Layer) => {
					const latLng = (layer as Marker).getLatLng();
					return (latLng.lat - center.lat) ** 2 + (latLng.lng - center.lng) ** 2;
				};

			//Nearest the centre last, as the queue is taken from the end
			this._addQueue = toAdd.sort((a, b) => distance(b) - distance(a));
			this._setPending(this._addQueue.length);
			this._processQueue();
		}
	}

	private _processQueue() {
		this._addFrame = 0;

		if(!this._map) {
			this._clearQueue();
			return;
		}

		const start = performance.now();

		while(this._addQueue.length && performance.now() - start < ADD_FRAME_BUDGET_MS) {
			const layer = this._addQueue.pop()!;

			//Things may have changed since the layer was queued
			if(this.hasLayer(layer) && !this._map.hasLayer(layer) && this._shouldShow(layer)) {
				this._addToMap(layer);
			}
		}

		this._setPending(this._addQueue.length);

		if(this._addQueue.length) {
			this._addFrame = requestAnimationFrame(() => this._processQueue());
		}
	}

	private _clearQueue() {
		if(this._addFrame) {
			cancelAnimationFrame(this._addFrame);
			this._addFrame = 0;
		}

		this._addQueue = [];
		this._setPending(0);
	}

	private _dequeue(layer: Layer) {
		const index = this._addQueue.indexOf(layer);

		if(index > -1) {
			this._addQueue.splice(index, 1);
			this._setPending(this._addQueue.length);
		}
	}

	// Each group reports how many of its markers are still to be added, into one shared total
	private _pendingReported = 0;

	private _setPending(count: number) {
		if(count !== this._pendingReported) {
			pendingMarkerCount.value += count - this._pendingReported;
			this._pendingReported = count;
		}
	}

	private _updateView() {
		const bounds: LatLngBounds = this._map.getBounds().pad(VIEWPORT_PADDING);

		this._zoom = this._map.getZoom();
		this._viewBounds = {
			minX: bounds.getWest(),
			maxX: bounds.getEast(),
			minY: bounds.getSouth(),
			maxY: bounds.getNorth(),
		};
	}

	/** Whether the given layer should currently be on the map. */
	private _shouldShow(layer: Layer): boolean {
		if(!this._viewBounds) {
			this._updateView();
		}

		if(!isVisibleAtZoom(this._zoom, (layer as any).options, this.options)) {
			return false;
		}

		if(layer instanceof Marker) {
			//Removing a marker would close its popup out from under the user
			if(layer.isPopupOpen()) {
				return true;
			}

			const latLng = layer.getLatLng();
			return isInBounds(latLng.lng, latLng.lat, this._viewBounds!);
		}

		return true;
	}

	private _addToMap(layer: Layer) {
		this._map.addLayer(layer)

		//Create marker label immediately if labels are visible by default
		if(layer instanceof GenericMarker && this.options.showLabels) {
			(layer as GenericMarker).createLabel();
		}
	}

	private _removeFromMap(layer: Layer) {
		this._map.removeLayer(layer)
	}
}
