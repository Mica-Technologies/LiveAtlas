import {type Plugin} from 'vite';
import {readdirSync, readFileSync} from 'fs';
import {resolve, basename} from 'path';

export function svgSpritePlugin(iconDir: string): Plugin {
	const virtualModuleId = 'virtual:svg-icons-register';
	const resolvedVirtualModuleId = '\0' + virtualModuleId;

	return {
		name: 'svg-sprite-inline',
		resolveId(id) {
			if (id === virtualModuleId) return resolvedVirtualModuleId;
		},
		load(id) {
			if (id !== resolvedVirtualModuleId) return;

			const files = readdirSync(iconDir).filter(f => f.endsWith('.svg'));
			const symbols = files.map(file => {
				const name = basename(file, '.svg');
				let svg = readFileSync(resolve(iconDir, file), 'utf-8');
				const viewBoxMatch = svg.match(/viewBox="([^"]*)"/);
				const widthMatch = svg.match(/\bwidth="([^"]*)"/);
				const heightMatch = svg.match(/\bheight="([^"]*)"/);
				const viewBox = viewBoxMatch
					? viewBoxMatch[1]
					: `0 0 ${widthMatch?.[1] || 200} ${heightMatch?.[1] || 200}`;

				let inner = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');
				inner = inner.replace(/\s*xmlns="[^"]*"/g, '');

				return `<symbol id="icon--${name}" viewBox="${viewBox}">${inner}</symbol>`;
			});

			const code = `
(function() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ${JSON.stringify(symbols.join('\n'))};
  document.body.insertBefore(svg, document.body.firstChild);
})();
`;
			return code;
		},
	};
}
