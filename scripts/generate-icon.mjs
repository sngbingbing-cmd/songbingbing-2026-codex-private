import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartLineUp } from '@phosphor-icons/react';

const icon = renderToStaticMarkup(React.createElement(ChartLineUp, {
  size: 256,
  weight: 'duotone',
  color: '#ffffff',
}));
const content = icon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="32" y="32" width="960" height="960" rx="210" fill="#146f75"/>
  <g fill="#ffffff" transform="translate(162 162) scale(2.734375)">${content}</g>
</svg>`;
fs.mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../build/icon.svg', import.meta.url), svg);
