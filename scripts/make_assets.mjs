import sharp from 'sharp';

async function generateAssets() {
  console.log('Generating custom assets...');

  // 1. FOR YOU (Solo player / fan entering stadium tunnel)
  // hero-tunnel.webp is 1672 x 941
  // We extract a dramatic 896x1200 portrait centered on the player walking into the stadium
  const playerCrop = await sharp('public/assets/hero-tunnel.webp')
    .extract({ left: 980, top: 0, width: 692, height: 941 })
    .resize(896, 1200, { fit: 'cover' })
    .toBuffer();

  // Create SVG overlay with athletic jersey numbers and name
  const forYouOverlay = Buffer.from(`
    <svg width="896" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="jersey-texture" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <path id="arch" d="M 420,352 Q 485,348 550,352" />
      </defs>
      <g filter="url(#jersey-texture)">
        <!-- Athletic name -->
        <text x="485" y="338" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="25" fill="#e8dfc8" letter-spacing="5" text-anchor="middle" opacity="0.9">CARTER</text>
        <!-- Athletic number -->
        <text x="485" y="418" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="80" fill="#e8dfc8" letter-spacing="2" text-anchor="middle" opacity="0.9">07</text>
      </g>
    </svg>
  `);

  await sharp(playerCrop)
    .composite([{ input: forYouOverlay, top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toFile('public/assets/for-you.webp');

  console.log('Created public/assets/for-you.webp');

  // 2. SEEN IN THE WILD (Fan in the city court / editorial street matchday)
  // editorial-player.webp is 1086 x 1448
  // Let's crop and add personalized detailing
  const wildCrop = await sharp('public/assets/editorial-player.webp')
    .resize(896, 1200, { fit: 'cover', position: 'top' })
    .toBuffer();

  const wildOverlay = Buffer.from(`
    <svg width="896" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.2"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
        </linearGradient>
      </defs>
      <rect width="896" height="1200" fill="url(#vignette)"/>
      <g transform="translate(60, 1100)">
        <text x="0" y="0" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="22" fill="#f8f04a" letter-spacing="3">SEEN IN THE WILD</text>
        <text x="0" y="24" font-family="sans-serif" font-weight="700" font-size="13" fill="#ffffff" letter-spacing="1">NYC NIGHT COURT · CUSTOM 10</text>
      </g>
    </svg>
  `);

  await sharp(wildCrop)
    .composite([{ input: wildOverlay, top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toFile('public/assets/seen-in-wild.webp');

  console.log('Created public/assets/seen-in-wild.webp');
}

generateAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
