/*
 * Copyright 2026 LiveAtlas Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// Loads an SVG element as an Image. We serialize the live SVG (which
// carries computed positions for Leaflet's overlay paths) to a Blob so
// it can be drawn onto the screenshot canvas as a rasterized layer.
const loadSvgAsImage = (svg: SVGElement, width: number, height: number): Promise<HTMLImageElement> => {
	const clone = svg.cloneNode(true) as SVGElement;
	// Lock the cloned SVG's width/height so the rasterized image matches
	// the on-screen rendering instead of defaulting to the viewBox.
	clone.setAttribute('width', String(width));
	clone.setAttribute('height', String(height));
	const xml = new XMLSerializer().serializeToString(clone);
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = e => reject(e);
		img.src = url;
	});
};

// Tries to draw a single image element onto the canvas, swallowing CORS
// errors so the rest of the capture can still complete. Returns whether
// the draw succeeded so the caller can flag a partial capture.
const drawImageSafe = (
	ctx: CanvasRenderingContext2D, img: HTMLImageElement,
	x: number, y: number, w: number, h: number,
): boolean => {
	try {
		ctx.drawImage(img, x, y, w, h);
		return true;
	} catch {
		return false;
	}
};

export interface ScreenshotResult {
	blob: Blob;
	corsTainted: boolean;
}

/**
 * Renders the visible map area into a PNG by walking the Leaflet panes.
 * Captures tile images, the SVG overlay (areas / lines / circles), and
 * point marker icons. Marker labels and chat bubbles are deliberately
 * skipped to keep the canvas pipeline self-contained.
 */
export const captureMapScreenshot = async (mapEl: HTMLElement): Promise<ScreenshotResult> => {
	const rect = mapEl.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;

	const canvas = document.createElement('canvas');
	canvas.width = Math.round(rect.width * dpr);
	canvas.height = Math.round(rect.height * dpr);
	const ctx = canvas.getContext('2d');
	if(!ctx) {
		throw new Error('2D canvas context unavailable');
	}
	ctx.scale(dpr, dpr);

	// Fill the background using the map element's actual color so dark/
	// light themes both produce readable images.
	const bg = window.getComputedStyle(mapEl).backgroundColor || '#000';
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, rect.width, rect.height);

	let corsTainted = false;

	// 1. Tile images. We rely on the browser already having loaded them,
	// so no awaiting — we just draw the current state.
	const tiles = mapEl.querySelectorAll<HTMLImageElement>('img.leaflet-tile');
	for(const tile of tiles) {
		if(!tile.complete || tile.naturalWidth === 0) continue;
		const r = tile.getBoundingClientRect();
		const ok = drawImageSafe(ctx, tile,
			r.left - rect.left, r.top - rect.top, r.width, r.height);
		if(!ok) corsTainted = true;
	}

	// 2. SVG overlay panes (areas, lines, circles). Each pane is a
	// single SVG, rasterized as a whole image to preserve stacking.
	const svgs = mapEl.querySelectorAll<SVGElement>('.leaflet-overlay-pane svg');
	for(const svg of svgs) {
		const r = svg.getBoundingClientRect();
		if(r.width === 0 || r.height === 0) continue;
		try {
			const img = await loadSvgAsImage(svg, r.width, r.height);
			ctx.drawImage(img, r.left - rect.left, r.top - rect.top, r.width, r.height);
		} catch {
			// SVG had a foreignObject or external resource we couldn't
			// inline — skip the overlay rather than failing the capture.
		}
	}

	// 3. Point marker icons (label spans are skipped intentionally).
	const markerIcons = mapEl.querySelectorAll<HTMLImageElement>(
		'.leaflet-marker-pane .marker .marker__icon, .leaflet-marker-pane > .leaflet-marker-icon img');
	for(const icon of markerIcons) {
		if(!icon.complete || icon.naturalWidth === 0) continue;
		const r = icon.getBoundingClientRect();
		const ok = drawImageSafe(ctx, icon,
			r.left - rect.left, r.top - rect.top, r.width, r.height);
		if(!ok) corsTainted = true;
	}

	const blob = await new Promise<Blob | null>(resolve =>
		canvas.toBlob(b => resolve(b), 'image/png'));
	if(!blob) {
		throw new Error('Failed to encode PNG');
	}
	return {blob, corsTainted};
};

export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	// Defer revoke so the download has a chance to start.
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
