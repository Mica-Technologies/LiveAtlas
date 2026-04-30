import 'vuetify/styles';
import {createVuetify} from 'vuetify';
import {aliases, mdi} from 'vuetify/iconsets/mdi-svg';

const theme = new URLSearchParams(window.location.search).get('theme');

export const vuetify = createVuetify({
	theme: {
		defaultTheme: theme === 'light' ? 'light' : 'dark',
		themes: {
			dark: {
				dark: true,
				colors: {
					background: '#080810',
					surface: '#0f1119',
					'surface-variant': '#1a1d2e',
					primary: '#3d8af7',
					secondary: '#5c6bc0',
					error: '#ef5350',
					warning: '#ffa726',
					success: '#66bb6a',
					info: '#29b6f6',
					'on-background': '#ffffffd9',
					'on-surface': '#ffffffd9',
					'on-primary': '#ffffff',
					'on-secondary': '#ffffff',
					'on-error': '#ffffff',
					'on-warning': '#000000',
					'on-success': '#000000',
					'on-info': '#000000',
				},
				variables: {
					'border-color': '#ffffff',
					'border-opacity': 0.12,
					'high-emphasis-opacity': 0.85,
					'medium-emphasis-opacity': 0.6,
					'disabled-opacity': 0.45,
					'hover-opacity': 0.08,
					'focus-opacity': 0.12,
					'activated-opacity': 0.16,
					'pressed-opacity': 0.16,
				},
			},
			light: {
				dark: false,
				colors: {
					background: '#fcfcfc',
					surface: '#f5f7fa',
					'surface-variant': '#ebeef5',
					primary: '#3d8af7',
					secondary: '#5c6bc0',
					error: '#ef5350',
					warning: '#ffa726',
					success: '#66bb6a',
					info: '#29b6f6',
					'on-background': '#2d3748',
					'on-surface': '#2d3748',
					'on-primary': '#ffffff',
					'on-secondary': '#ffffff',
					'on-error': '#ffffff',
					'on-warning': '#000000',
					'on-success': '#000000',
					'on-info': '#000000',
				},
				variables: {
					'border-color': '#000000',
					'border-opacity': 0.12,
					'high-emphasis-opacity': 0.87,
					'medium-emphasis-opacity': 0.6,
					'disabled-opacity': 0.38,
					'hover-opacity': 0.06,
					'focus-opacity': 0.12,
					'activated-opacity': 0.12,
					'pressed-opacity': 0.12,
				},
			},
		},
	},
	icons: {
		defaultSet: 'mdi',
		aliases,
		sets: {mdi},
	},
	defaults: {
		global: {
			density: 'comfortable',
		},
	},
});
