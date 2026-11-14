import type { MetadataRoute } from 'next';
import { APP_META } from '@/lib/app-meta';

// Installable on the home screen, with this app's own name, icon and colours (E11).
// The apps carry their own 512 px icon.png and 180 px apple-icon.png (Next serves them
// by file name); the template's placeholder is an SVG, hence this fleet copy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             APP_META.name,
    short_name:       APP_META.shortName,
    description:      APP_META.description,
    start_url:        '/app',
    display:          'standalone',
    background_color: APP_META.themeColor,
    theme_color:      APP_META.themeColor,
    icons: [
      { src: '/icon.png',       sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
