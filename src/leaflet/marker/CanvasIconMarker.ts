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

import {LatLng, LatLngExpression, Layer, LayerOptions, Map as LeafletMap, Point, PointTuple, latLng, point} from "leaflet";
import {LiveAtlasPointMarker} from "@/index";
import {IconCanvasRenderer} from "@/leaflet/layer/IconCanvasRenderer";

export interface CanvasIconMarkerOptions extends LayerOptions {
	minZoom?: number;
	maxZoom?: number;
}

/**
 * A point marker drawn on the map's shared icon canvas ({@link IconCanvasRenderer}) rather than as
 * an HTML element of its own. It supports what marker sets use: popups, a hover label, right click
 * and zoom limits.
 */
export class CanvasIconMarker extends Layer {
	declare options: CanvasIconMarkerOptions;
	declare _map: LeafletMap;

	iconUrl: string;
	label: string;
	isHtml: boolean;
	/** Draw order between marker sets: higher draws on top. Set by the layer group. */
	priority = 0;

	private _latLng: LatLng;
	private _iconSize?: PointTuple;
	private _iconAnchor?: PointTuple;
	private _renderer?: IconCanvasRenderer;
	private _projected?: Point;
	private _projectedZoom?: number;

	constructor(latLng: LatLngExpression, options: LiveAtlasPointMarker) {
		super({});

		this._latLng = latLngFrom(latLng);
		this.iconUrl = options.iconUrl;
		this.label = options.tooltipHTML || options.tooltip;
		this.isHtml = !!options.tooltipHTML;
		this._iconSize = options.iconSize;
		this._iconAnchor = options.iconAnchor;
		this.options.minZoom = options.minZoom;
		this.options.maxZoom = options.maxZoom;
	}

	onAdd(map: LeafletMap) {
		this._renderer = IconCanvasRenderer.for(map);
		this._renderer.addIcon(this);

		return this;
	}

	onRemove() {
		this._renderer?.removeIcon(this);
		this._renderer = undefined;

		return this;
	}

	getLatLng(): LatLng {
		return this._latLng;
	}

	setLatLng(latLng: LatLngExpression): this {
		this._latLng = latLngFrom(latLng);
		this._projected = undefined;
		this._renderer?.requestRedraw();

		return this;
	}

	/** Applies changed marker options, redrawing only if something visible changed. */
	update(options: LiveAtlasPointMarker) {
		const label = options.tooltipHTML || options.tooltip,
			changed = this.iconUrl !== options.iconUrl
				|| String(this._iconSize) !== String(options.iconSize)
				|| String(this._iconAnchor) !== String(options.iconAnchor);

		this.iconUrl = options.iconUrl;
		this.label = label;
		this.isHtml = !!options.tooltipHTML;
		this._iconSize = options.iconSize;
		this._iconAnchor = options.iconAnchor;

		if(changed) {
			this._renderer?.requestRedraw();
		}
	}

	/** Icons have no element of their own; the sidebar ping draws a highlight on the canvas instead. */
	getElement(): undefined {
		return undefined;
	}

	ping() {
		this._renderer?.ping(this);
	}

	/** Position on the map's layer, projected once per zoom level. */
	getLayerPoint(map: LeafletMap): Point {
		const zoom = map.getZoom();

		if(!this._projected || this._projectedZoom !== zoom) {
			this._projected = map.project(this._latLng, zoom);
			this._projectedZoom = zoom;
		}

		return this._projected.subtract(map.getPixelOrigin());
	}

	/** Drawn size: the marker's icon size, or the image's own size if it has none. */
	getSize(image: HTMLImageElement): Point {
		return this._iconSize ? numericPoint(this._iconSize) : point(image.naturalWidth || 16, image.naturalHeight || 16);
	}

	/** Offset of the marker's position from the icon's top left. Centred when not given. */
	getAnchor(size: Point): Point {
		return this._iconAnchor ? numericPoint(this._iconAnchor) : size.divideBy(2);
	}
}

// Marker data can hold sizes as strings, which would concatenate rather than add
const numericPoint = (value: PointTuple): Point => point(Number(value[0]) || 0, Number(value[1]) || 0);

const latLngFrom = (value: LatLngExpression): LatLng => value instanceof LatLng ? value : latLng(value as any);
