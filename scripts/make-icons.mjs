import sharp from 'sharp';
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0f2a3d"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
<circle cx="256" cy="236" r="130" fill="none" stroke="#f4b942" stroke-width="30"/>
<path d="M256 366 L256 440" stroke="#f4b942" stroke-width="30" stroke-linecap="round"/>
<text x="256" y="282" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="150" text-anchor="middle" fill="#ffffff">S</text>
</g></svg>`;
await sharp(Buffer.from(svg(0))).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(svg(0))).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(70))).resize(512).png().toFile('public/icons/maskable-512.png');
console.log('icons ok');
