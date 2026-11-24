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

import {DomUtil, LatLng, Map as LeafletMap, Point, Renderer} from "leaflet";
import type {CanvasIconMarker} from "@/leaflet/marker/CanvasIconMarker";

/** Pane holding the icon canvas. Sits where the marker set panes start, below players and popups. */
export const ICON_CANVAS_PANE = 'marker-icons';

/** How long the highlight from pinging a marker in the sidebar lasts. */
const PING_DURATION_MS = 2200;

/** Extra pixels around an icon that still count as hitting it, so small icons are easy to click. */
const HIT_SLOP = 2;

interface DrawnIcon {
	icon: CanvasIconMarker;
	x: number; //Layer point of the top left corner
	y: number;
	width: number;
	height: number;
}

interface LoadedImage {
	image: HTMLImageElement;
	loaded: boolean;
	failed: boolean;
}

/**
 * Draws point marker icons for the whole map onto a single canvas.
 *
 * Each icon used to be its own HTML element, and browsers slow down badly with a few thousand of
 * them on screen: every repaint, pan and zoom has to deal with each one. Drawing them all into one
 * canvas costs a few milliseconds however many there are.
 *
 * Positioning, panning and zoom animation come from Leaflet's Renderer, as for its own vector
 * canvas. The canvas itself ignores the mouse: a capture listener on the map container hit tests
 * icons and hands clicks, right clicks and hovers to the marker under the pointer, so popups and
 * context menus work as before. A single HTML label shows the hovered marker's name.
 */
export class IconCanvasRenderer extends Renderer {
	declare _map: LeafletMap;
	declare _container: HTMLCanvasElement;
	declare _bounds: any;
	declare _zoom: number;

	private _ctx?: CanvasRenderingContext2D;
	private readonly _icons: Set<CanvasIconMarker> = new Set();
	private _drawn: DrawnIcon[] = [];
	private _frame = 0;
	private _hovered?: CanvasIconMarker;
	private _label?: HTMLDivElement;
	private _labelText?: HTMLSpanElement;
	private _ping?: {latLng: LatLng, start: number};

	private static readonly _images: Map<string, LoadedImage> = new Map();
	private static readonly _renderers: WeakMap<LeafletMap, IconCanvasRenderer> = new WeakMap();

	/** The renderer for the given map, created and added on first use. */
	static for(map: LeafletMap): IconCanvasRenderer {
		let renderer = IconCanvasRenderer._renderers.get(map);

		if(!renderer) {
			if(!map.getPane(ICON_CANVAS_PANE)) {
				map.createPane(ICON_CANVAS_PANE).style.zIndex = '401';
			}

			renderer = new IconCanvasRenderer({pane: ICON_CANVAS_PANE, padding: 0.25});
			IconCanvasRenderer._renderers.set(map, renderer);
			map.addLayer(renderer);
		}

		return renderer;
	}

	addIcon(icon: CanvasIconMarker) {
		this._icons.add(icon);
		this.requestRedraw();
	}

	removeIcon(icon: CanvasIconMarker) {
		if(this._icons.delete(icon)) {
			if(this._hovered === icon) {
				this._setHovered(undefined);
			}

			this.requestRedraw();
		}
	}

	/**
	 * Briefly draws a ring at the given position, so a marker picked in the sidebar can be found.
	 * It goes by position rather than by icon, so it shows even when the marker's set is hidden at
	 * the current zoom.
	 */
	ping(latLng: LatLng) {
		this._ping = {latLng, start: performance.now()};
		this.requestRedraw();
	}

	requestRedraw() {
		if(!this._frame && this._map) {
			this._frame = requestAnimationFrame(() => {
				this._frame = 0;
				this._redraw();
			});
		}
	}

	// Leaflet Renderer hooks

	_initContainer() {
		const container = this._container = document.createElement('canvas');
		container.classList.add('leaflet-icon-canvas');
		// Undefined where canvas isn't supported (or in tests): icons are then simply not drawn
		this._ctx = container.getContext('2d') || undefined;

		this._label = DomUtil.create('div', 'marker marker--canvas-label') as HTMLDivElement;
		this._labelText = DomUtil.create('span', 'marker__label', this._label) as HTMLSpanElement;
		this._label.hidden = true;
	}

	_destroyContainer() {
		cancelAnimationFrame(this._frame);
		this._frame = 0;
		DomUtil.remove(this._container);
		this._label?.remove();
		delete (this as any)._ctx;
	}

	onAdd(map: LeafletMap) {
		// @ts-ignore - Renderer.onAdd isn't in the typings
		Renderer.prototype.onAdd.call(this, map);

		map.getPane('tooltipPane')!.appendChild(this._label!);

		// Capture, so an icon gets the event before whatever is drawn underneath it (the vector
		// canvas, tiles). Mousedown is left alone so the map can still be dragged from an icon.
		const container = map.getContainer();
		container.addEventListener('click', this._onClick, true);
		container.addEventListener('contextmenu', this._onClick, true);
		container.addEventListener('mousemove', this._onMouseMove, true);
		container.addEventListener('mouseleave', this._onMouseLeave);
		map.on('popupopen movestart zoomstart', this._hideLabel, this);
		// A move needn't start with movestart (a view set from the URL), and the pointer is no longer
		// over the same icon afterwards: forget the hover until the mouse moves again
		map.on('moveend zoomend viewreset', this._clearHover, this);
		IconCanvasRenderer._live.add(this);

		return this;
	}

	onRemove(map: LeafletMap) {
		const container = map.getContainer();
		container.removeEventListener('click', this._onClick, true);
		container.removeEventListener('contextmenu', this._onClick, true);
		container.removeEventListener('mousemove', this._onMouseMove, true);
		container.removeEventListener('mouseleave', this._onMouseLeave);
		map.off('popupopen movestart zoomstart', this._hideLabel, this);
		map.off('moveend zoomend viewreset', this._clearHover, this);
		IconCanvasRenderer._live.delete(this);
		IconCanvasRenderer._renderers.delete(map);
		this._setHovered(undefined);

		// @ts-ignore - Renderer.onRemove isn't in the typings
		Renderer.prototype.onRemove.call(this, map);

		return this;
	}

	_update() {
		if((this._map as any)._animatingZoom && this._bounds) {
			return;
		}

		// @ts-ignore - Renderer._update isn't in the typings
		Renderer.prototype._update.call(this);

		if(!this._ctx) {
			return;
		}

		const bounds = this._bounds,
			size = bounds.getSize(),
			ratio = Math.min(window.devicePixelRatio || 1, 2),
			container = this._container;

		DomUtil.setPosition(container, bounds.min);

		// Setting the size clears the canvas and resets the context
		container.width = Math.round(size.x * ratio);
		container.height = Math.round(size.y * ratio);
		container.style.width = `${size.x}px`;
		container.style.height = `${size.y}px`;

		this._ctx!.setTransform(ratio, 0, 0, ratio, -bounds.min.x * ratio, -bounds.min.y * ratio);
		this._ctx!.imageSmoothingEnabled = false;

		cancelAnimationFrame(this._frame);
		this._frame = 0;
		this._redraw();
	}

	// Drawing

	private _redraw() {
		const ctx = this._ctx;

		if(!ctx || !this._map || !this._bounds) {
			return;
		}

		const bounds = this._bounds,
			min = bounds.min,
			max = bounds.max;

		ctx.clearRect(min.x, min.y, max.x - min.x, max.y - min.y);

		// Higher priority sets draw later, on top. Within a set, later markers draw on top, as their
		// elements used to.
		const icons = Array.from(this._icons).sort((a, b) => a.priority - b.priority);
		const drawn: DrawnIcon[] = [];

		for(const icon of icons) {
			const image = this._getImage(icon.iconUrl);

			if(!image.loaded) {
				continue;
			}

			const point = icon.getLayerPoint(this._map),
				size = icon.getSize(image.image),
				anchor = icon.getAnchor(size),
				x = Math.round(point.x - anchor.x),
				y = Math.round(point.y - anchor.y);

			if(x > max.x || y > max.y || x + size.x < min.x || y + size.y < min.y) {
				continue;
			}

			ctx.drawImage(image.image, x, y, size.x, size.y);
			drawn.push({icon, x, y, width: size.x, height: size.y});
		}

		this._drawn = drawn;
		this._drawPing(ctx);

		// Icons may have moved or gone with this redraw (a marker update, a move): keep the hover
		// label with its icon, or drop it
		if(this._hovered) {
			this._showLabel(this._hovered);
		}
	}

	private _drawPing(ctx: CanvasRenderingContext2D) {
		if(!this._ping) {
			return;
		}

		const elapsed = performance.now() - this._ping.start;

		if(elapsed > PING_DURATION_MS) {
			this._ping = undefined;
			return;
		}

		// Fades in fast, holds, then fades out, pulsing twice so it catches the eye on a busy map
		const progress = elapsed / PING_DURATION_MS,
			alpha = progress < 0.08 ? progress / 0.08 : progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4,
			pulse = (Math.sin(progress * Math.PI * 4 - Math.PI / 2) + 1) / 2,
			radius = 13 + 8 * pulse,
			centre = this._map.latLngToLayerPoint(this._ping.latLng);

		ctx.save();
		ctx.beginPath();
		ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
		// A dark edge under the yellow keeps it visible on light ground as well as dark
		ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.6})`;
		ctx.lineWidth = 7;
		ctx.stroke();
		ctx.strokeStyle = `rgba(255, 220, 80, ${alpha})`;
		ctx.lineWidth = 4;
		ctx.stroke();
		ctx.restore();

		this.requestRedraw();
	}

	private _getImage(url: string): LoadedImage {
		let entry = IconCanvasRenderer._images.get(url);

		if(!entry) {
			const image = new Image();
			entry = {image, loaded: false, failed: false};
			IconCanvasRenderer._images.set(url, entry);

			const loaded = entry;
			image.onload = () => {
				loaded.loaded = true;
				IconCanvasRenderer._redrawAll();
			};
			image.onerror = () => loaded.failed = true;
			image.src = url;
		}

		return entry;
	}

	// Images are shared between maps, so a finished load redraws every renderer on the page
	private static readonly _live: Set<IconCanvasRenderer> = new Set();

	private static _redrawAll() {
		IconCanvasRenderer._live.forEach(renderer => renderer.requestRedraw());
	}

	// Mouse handling

	/** The topmost icon under the given layer point, if any. */
	iconAt(point: Point): CanvasIconMarker | undefined {
		for(let i = this._drawn.length - 1; i >= 0; i--) {
			const d = this._drawn[i];

			if(point.x >= d.x - HIT_SLOP && point.x <= d.x + d.width + HIT_SLOP
				&& point.y >= d.y - HIT_SLOP && point.y <= d.y + d.height + HIT_SLOP) {
				return d.icon;
			}
		}

		return undefined;
	}

	// Only events over the map itself, not over its controls, popups or HTML markers above it
	private _isOverMap(e: MouseEvent): boolean {
		const target = e.target as HTMLElement | null;

		return !!target && !target.closest('.leaflet-control, .leaflet-popup, .leaflet-marker-icon, .leaflet-tooltip');
	}

	private _iconForEvent(e: MouseEvent): CanvasIconMarker | undefined {
		if(!this._map || !this._isOverMap(e) || (this._map as any)._animatingZoom) {
			return undefined;
		}

		return this.iconAt(this._map.mouseEventToLayerPoint(e));
	}

	private _onClick = (e: MouseEvent) => {
		// A click that ends a drag isn't a click on the icon it ended over
		if(e.type === 'click' && (this._map as any)?._draggableMoved(this._map)) {
			return;
		}

		const icon = this._iconForEvent(e);

		if(!icon) {
			return;
		}

		// The icon takes the event: nothing underneath it sees the DOM event. The map still gets it
		// after the icon, through Leaflet, as it would from an HTML marker.
		e.stopPropagation();
		(this._map as any)._fireDOMEvent(e, e.type, [icon]);
	};

	private _onMouseMove = (e: MouseEvent) => {
		// With a button held this may be the start of a drag, which Leaflet picks up from moves
		// reaching the document, so leave those alone
		if(!this._map || e.buttons || (this._map.dragging as any)?.moving?.()) {
			this._setHovered(undefined);
			return;
		}

		const icon = this._iconForEvent(e);
		this._setHovered(icon);

		if(icon) {
			// Keep the vector canvas underneath from showing its own hover tooltip through the icon;
			// the map still sees the move (for the coordinates display) through Leaflet
			e.stopPropagation();
			(this._map as any)._fireDOMEvent(e, 'mousemove', [icon]);
		}
	};

	private _onMouseLeave = () => this._setHovered(undefined);

	private _clearHover() {
		this._setHovered(undefined);
	}

	private _setHovered(icon?: CanvasIconMarker) {
		if(icon === this._hovered) {
			// Still over the same icon: bring its label back if a popup or a move hid it meanwhile
			if(icon && this._label?.hidden) {
				this._showLabel(icon);
			}

			return;
		}

		const container = this._map?.getContainer();

		if(this._hovered && container) {
			container.classList.remove('leaflet-icon-canvas--hover');
		}

		this._hovered = icon;

		if(!icon) {
			this._hideLabel();
			return;
		}

		container?.classList.add('leaflet-icon-canvas--hover');
		this._showLabel(icon);
	}

	private _showLabel(icon: CanvasIconMarker) {
		if(!this._label || !this._labelText || !icon.label || icon.isPopupOpen()) {
			this._hideLabel();
			return;
		}

		const entry = this._drawn.find(d => d.icon === icon);

		if(!entry) {
			this._hideLabel();
			return;
		}

		if(icon.isHtml) {
			this._labelText.innerHTML = icon.label;
		} else {
			this._labelText.textContent = icon.label;
		}

		DomUtil.setPosition(this._label, new Point(entry.x + entry.width, entry.y + entry.height / 2));
		this._label.hidden = false;
	}

	private _hideLabel() {
		if(this._label && !this._label.hidden) {
			this._label.hidden = true;
		}
	}
}
