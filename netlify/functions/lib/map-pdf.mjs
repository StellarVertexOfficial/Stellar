import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buffer } from 'node:stream/consumers';
import PDFDocument from 'pdfkit';
import catalog from '../../../stars-data.js';
import calculation from '../../../mapa-calculo.js';

const { layout, themes, coordinatesForCity, parseDateTime, siderealAngle, project, starRadius, dateLabel, coordinateLabel } = calculation;
const { width, height, cx, cy, radius } = layout;
const scale = (30 / 2.54 * 72) / width;
const require = createRequire(import.meta.url);

function mapLocation(map) {
  return map.coordenadas ?? coordinatesForCity(map.lugar);
}

export function canRenderMap(map) {
  return map && Boolean(mapLocation(map) && parseDateTime(map.fecha, map.hora));
}

let fonts;
function getFonts() {
  fonts ??= {
    regular: readFileSync(require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff')),
    bold: readFileSync(require.resolve('@fontsource/inter/files/inter-latin-700-normal.woff')),
  };
  return fonts;
}

function centeredText(pdf, text, y, size, maxWidth, x = cx) {
  if (!text) return;
  pdf.fontSize(size);
  const textWidth = pdf.widthOfString(text);
  if (textWidth > maxWidth) pdf.fontSize(size * maxWidth / textWidth);
  pdf.text(text, x - pdf.widthOfString(text) / 2, y - pdf.currentLineHeight() / 2, { lineBreak: false });
}

function drawMap(pdf, map) {
  const location = mapLocation(map);
  const date = parseDateTime(map.fecha, map.hora);
  const angle = siderealAngle(date, location);
  const point = (ra, dec) => project(ra, dec, location.lat, angle);
  const theme = themes[map.estilo];

  pdf.scale(scale);
  pdf.rect(0, 0, width, height).fill(theme.bg);
  pdf.circle(cx, cy, radius).fill(theme.disc);
  pdf.save().circle(cx, cy, radius).clip();
  if (map.lineas !== false) {
    pdf.strokeColor(theme.line).strokeOpacity(theme.lineOpacity).lineWidth(2);
    for (const constellation of catalog.lines) {
      let previous = null;
      for (const [ra, dec] of constellation) {
        const position = point(ra, dec);
        if (position) {
          if (previous) pdf.lineTo(...position);
          else pdf.moveTo(...position);
        }
        previous = position;
      }
      pdf.stroke();
    }
  }
  for (const [ra, dec, magnitude] of catalog.stars) {
    const position = point(ra, dec);
    if (position) pdf.circle(...position, starRadius(magnitude));
  }
  pdf.fill(theme.star).restore();
  pdf.circle(cx, cy, radius + 28).lineWidth(3).stroke(theme.ink);
  pdf.fillColor(theme.ink).font('regular');
  centeredText(pdf, 'N', cy - radius - 70, 34, 70);
  centeredText(pdf, 'S', cy + radius + 70, 34, 70);
  centeredText(pdf, 'E', cy, 34, 70, cx - radius - 70);
  centeredText(pdf, 'O', cy, 34, 70, cx + radius + 70);

  pdf.font('bold');
  centeredText(pdf, map.titulo, 1960, 120, 1400);
  pdf.font('regular');
  const time = map.horaVisible === false ? '' : ` · ${map.hora}`;
  centeredText(pdf, dateLabel(date) + time, 2050, 52, 1400);
  centeredText(pdf, `${map.lugar}   ${coordinateLabel(location)}`, 2118, 34, 1400);
  pdf.fillOpacity(0.75);
  centeredText(pdf, map.msg, 2220, 44, 1300);
}

export async function buildOrderPdf(order) {
  const { regular, bold } = getFonts();
  const created = new Date(order.createdAt);
  const pdf = new PDFDocument({
    autoFirstPage: false,
    size: [width * scale, height * scale],
    margin: 0,
    font: regular,
    info: { Title: 'Mapa estelar de StellarVertex', Author: 'StellarVertex', CreationDate: created, ModDate: created },
  });
  const bytes = buffer(pdf);
  pdf.registerFont('regular', regular).registerFont('bold', bold);
  for (const { map } of order.items) {
    pdf.addPage();
    drawMap(pdf, map);
  }
  pdf.end();
  return bytes;
}
