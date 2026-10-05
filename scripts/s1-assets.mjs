// Deterministic original demo illustrations and an explicitly illustrative PDF; no provider assets.
import fs from 'node:fs';
import path from 'node:path';
const output = path.resolve('apps/storefront/public/demo');
fs.mkdirSync(output, { recursive: true });
const defs = `<defs><linearGradient id="wall"><stop stop-color="#171A1C"/><stop offset=".5" stop-color="#454A4E"/><stop offset="1" stop-color="#121516"/></linearGradient><linearGradient id="metal"><stop stop-color="#75582E"/><stop offset=".25" stop-color="#B99169"/><stop offset=".5" stop-color="#E4CEA0"/><stop offset=".75" stop-color="#8A6742"/><stop offset="1" stop-color="#432F20"/></linearGradient><linearGradient id="silver"><stop stop-color="#60676C"/><stop offset=".4" stop-color="#E1E3E4"/><stop offset=".6" stop-color="#B8BDC1"/><stop offset="1" stop-color="#454A4E"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="#60676C"/><stop offset="1" stop-color="#121516"/></linearGradient><radialGradient id="light"><stop stop-color="#F1E6CC" stop-opacity=".4"/><stop offset="1" stop-color="#F1E6CC" stop-opacity="0"/></radialGradient></defs>`;
function svg(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">${defs}${content}</svg>`;
}
function cabin(silver = false) {
  return svg(
    `<rect width="1000" height="800" fill="#1D2022"/><path d="M100 60 300 140h400L900 60v670L700 610H300L100 730Z" fill="url(#wall)"/><path d="M300 140h400v470H300Z" fill="url(#${silver ? 'silver' : 'metal'})"/><path d="M100 60 300 140v470L100 730Z" fill="url(#${silver ? 'silver' : 'metal'})"/><path d="M900 60 700 140v470l200 120Z" fill="url(#wall)"/><path d="M100 730 300 610h400l200 120v70H100Z" fill="url(#floor)"/><path d="M110 72 310 153h380l200-81" fill="none" stroke="#F1E6CC" stroke-width="5"/><path d="M340 165v416M500 165v416M660 165v416" stroke="#432F20" stroke-opacity=".7"/><path d="M130 465 275 490M725 490 860 465" stroke="#D1D4D6" stroke-width="8"/><rect x="754" y="244" width="52" height="144" rx="6" fill="#121516" stroke="#9EA4A9"/><circle cx="780" cy="298" r="8" fill="#C9A15B"/><circle cx="780" cy="328" r="8" fill="#B8BDC1"/><ellipse cx="500" cy="160" rx="400" ry="160" fill="url(#light)"/><path d="M100 60h800v670H100Z" fill="none" stroke="#303437" stroke-width="24"/>`,
  );
}
const door = svg(
  `<rect width="1000" height="800" fill="#ECEEEF"/><path d="M160 80h680v660H160Z" fill="#303437"/><path d="M200 120h600v620H200Z" fill="url(#silver)"/><path d="M500 120v620" stroke="#171A1C" stroke-width="4"/><path d="M215 133h570v593H215Z" fill="none" stroke="#D1D4D6" stroke-width="3"/><rect x="438" y="54" width="124" height="36" fill="#121516"/><path d="m488 68 12-8 12 8" fill="none" stroke="#C9A15B" stroke-width="3"/><rect x="872" y="388" width="40" height="100" fill="#60676C"/><circle cx="892" cy="416" r="8" fill="#C9A15B"/><path d="M0 740h1000v60H0Z" fill="#D1D4D6"/><path d="M80 80v660M920 80v660" stroke="#D1D4D6" stroke-width="2"/>`,
);
const machine = svg(
  `<rect width="1000" height="800" fill="#E1E3E4"/><ellipse cx="510" cy="680" rx="330" ry="38" fill="#303437" opacity=".12"/><path d="M190 610h620v70H190Z" fill="#60676C"/><rect x="340" y="268" width="380" height="360" rx="16" fill="url(#wall)"/><path d="M380 300v285M420 300v285M460 300v285M500 300v285M540 300v285M580 300v285M620 300v285M660 300v285" stroke="#60676C" stroke-width="12"/><ellipse cx="338" cy="440" rx="174" ry="196" fill="url(#silver)"/><ellipse cx="338" cy="440" rx="144" ry="168" fill="#454A4E" stroke="#9EA4A9" stroke-width="12"/><ellipse cx="338" cy="440" rx="76" ry="96" fill="url(#silver)"/><ellipse cx="338" cy="440" rx="28" ry="36" fill="#121516"/><rect x="704" y="300" width="92" height="130" rx="8" fill="#C9A15B"/><path d="M236 638h92M624 638h92" stroke="#C9A15B" stroke-width="10"/>`,
);
const controller = svg(
  `<rect width="1000" height="800" fill="#ECEEEF"/><rect x="244" y="100" width="512" height="600" fill="url(#silver)" stroke="#60676C" stroke-width="10"/><rect x="294" y="160" width="412" height="450" fill="#171A1C"/><path d="M320 190h360v46H320Z" fill="#60676C"/><path d="M328 280h344v132H328Z" fill="#303437" stroke="#7D858B"/><path d="M340 430h100v156H340ZM460 430h80v156h-80ZM560 430h100v156H560Z" fill="#454A4E" stroke="#9EA4A9"/><path d="M350 196v400M650 196v400" stroke="#C9A15B" stroke-width="5"/><rect x="374" y="294" width="170" height="66" fill="#1D2022" stroke="#C9A15B"/><path d="M390 310h80M390 330h110" stroke="#C9A15B" stroke-width="3"/><circle cx="606" cy="324" r="10" fill="#C9A15B"/><path d="M260 650h480" stroke="#60676C" stroke-width="8"/>`,
);
for (const [name, content] of Object.entries({
  cabin: cabin(),
  silver: cabin(true),
  door,
  machine,
  controller,
  hero: cabin(),
}))
  fs.writeFileSync(path.join(output, name + '.svg'), content);
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
const stream =
  'BT /F1 22 Tf 60 750 Td (GOLDEN LIFT - DESIGN PREVIEW) Tj 0 -48 Td /F1 12 Tf (Illustrative document only. Not a certification or product specification.) Tj 0 -24 Td (No commercial or performance claims are established by this fixture.) Tj ET';
objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
let pdf = '%PDF-1.4\n',
  offsets = [0];
for (const [i, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf +=
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
  offsets
    .slice(1)
    .map((v) => String(v).padStart(10, '0') + ' 00000 n \n')
    .join('') +
  `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(output, 'specification.pdf'), pdf);
console.log(
  'Generated six original demo vector illustrations and one explicitly illustrative PDF.',
);
