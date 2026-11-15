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

import {DynmapMarkerUpdate} from "@/dynmap";

/**
 * Merges incoming marker updates into the pending queue, keeping only the newest update per
 * marker. Every update handler works from the marker's latest state (create, update in place, or
 * delete), so the intermediate states are never needed.
 *
 * Without this the queue grows with every change rather than with the number of markers. Browsers
 * don't run animation frames for a hidden tab, so a map left in the background on a server whose
 * markers move every few seconds came back to thousands of stale updates to replay.
 *
 * Marker ids already carry their type (point_, area_, circle_, line_), so set + id names one marker.
 * A marker keeps the queue position of its first pending update.
 */
export const coalesceMarkerUpdates = (pending: DynmapMarkerUpdate[], incoming: DynmapMarkerUpdate[]): DynmapMarkerUpdate[] => {
	if(!incoming.length) {
		return pending;
	}

	const byMarker = new Map<string, DynmapMarkerUpdate>();

	for(const update of pending) {
		byMarker.set(`${update.set}\u0000${update.id}`, update);
	}

	for(const update of incoming) {
		byMarker.set(`${update.set}\u0000${update.id}`, update);
	}

	return Array.from(byMarker.values());
}
