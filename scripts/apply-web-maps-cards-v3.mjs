import fs from 'node:fs';

const path = 'lib/browser-nubo-tools-line.ts';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('NUBO_MAPS_CARD_LIST_V3')) {
  if (!source.includes('NUBO_MAPS_WEB_OVERLAY_V2_LIST')) {
    throw new Error('maps cards v3: V2 map overlay must be applied first');
  }

  source = source.replace(
    '// NUBO_MAPS_WEB_OVERLAY_V2_LIST',
    '// NUBO_MAPS_WEB_OVERLAY_V2_LIST\n// NUBO_MAPS_CARD_LIST_V3',
  );

  const typeAnchor = `type NuboMapPlace = {\n  name: string;\n  category: string;\n  address: string;\n  distanceMeters: number;\n  lat: number;\n  lng: number;\n  mapsUrl: string;\n};`;
  const typeReplacement = `type NuboMapPlace = {\n  name: string;\n  category: string;\n  address: string;\n  distanceMeters: number;\n  lat: number;\n  lng: number;\n  mapsUrl: string;\n  imageUrl?: string;\n  website?: string;\n};`;
  if (!source.includes(typeAnchor)) {
    throw new Error('maps cards v3: NuboMapPlace type anchor missing');
  }
  source = source.replace(typeAnchor, typeReplacement);

  source = source.replace('timeout: 2500,', 'timeout: 1200,');
  source = source.replace('limit: 10,\n        radiusMeters: 2500,', 'limit: 8,\n        radiusMeters: 1800,');

  const oldImmediate = `  const position = location ? null : await readBrowserPosition();\n  const targetUrl = buildNuboMapsEmbedUrl(query, location, position);\n\n  holder.frame.src = targetUrl;\n  holder.overlay.style.display = \"block\";`;
  const newImmediate = `  // Paint the map immediately. Current-position refinement happens afterward,\n  // so a geolocation prompt can no longer make the whole Maps screen feel frozen.\n  const preliminaryUrl = buildNuboMapsEmbedUrl(query, location, null);\n  holder.frame.src = preliminaryUrl;\n  holder.overlay.style.display = \"block\";\n\n  const position = location ? null : await readBrowserPosition();\n  const targetUrl = buildNuboMapsEmbedUrl(query, location, position);\n  if (location || position) holder.frame.src = targetUrl;`;
  if (!source.includes(oldImmediate)) {
    throw new Error('maps cards v3: immediate map anchor missing');
  }
  source = source.replace(oldImmediate, newImmediate);

  const renderPattern = /    results\.forEach\(\(place, index\) => \{[\s\S]*?      holder\.listBody\.appendChild\(button\);\n    \}\);/;
  if (!renderPattern.test(source)) {
    throw new Error('maps cards v3: list render block missing');
  }

  const renderReplacement = `    results.forEach((place, index) => {\n      const card = document.createElement(\"div\");\n      Object.assign(card.style, {\n        borderBottom: \"1px solid #e6e8eb\",\n        padding: \"9px 10px 8px\",\n        background: \"#fff\",\n      });\n\n      const button = document.createElement(\"button\");\n      button.type = \"button\";\n      Object.assign(button.style, {\n        display: \"grid\",\n        gridTemplateColumns: \"86px minmax(0, 1fr)\",\n        gap: \"10px\",\n        width: \"100%\",\n        border: \"0\",\n        padding: \"0\",\n        background: \"transparent\",\n        color: \"#202124\",\n        textAlign: \"left\",\n        cursor: \"pointer\",\n      });\n\n      const media = document.createElement(\"div\");\n      Object.assign(media.style, {\n        position: \"relative\",\n        width: \"86px\",\n        height: \"64px\",\n        borderRadius: \"9px\",\n        overflow: \"hidden\",\n        background: \"#eef1f4\",\n      });\n\n      const fallback = document.createElement(\"div\");\n      fallback.textContent = \"📍\";\n      Object.assign(fallback.style, {\n        position: \"absolute\",\n        inset: \"0\",\n        display: \"grid\",\n        placeItems: \"center\",\n        fontSize: \"26px\",\n      });\n      media.appendChild(fallback);\n\n      if (place.imageUrl) {\n        const image = document.createElement(\"img\");\n        image.src = place.imageUrl;\n        image.alt = place.name + \" 圖片\";\n        image.loading = \"lazy\";\n        image.decoding = \"async\";\n        Object.assign(image.style, {\n          position: \"absolute\",\n          inset: \"0\",\n          width: \"100%\",\n          height: \"100%\",\n          objectFit: \"cover\",\n        });\n        image.addEventListener(\"error\", () => image.remove());\n        media.appendChild(image);\n      }\n\n      const number = document.createElement(\"span\");\n      number.textContent = String(index + 1);\n      Object.assign(number.style, {\n        position: \"absolute\",\n        left: \"5px\",\n        top: \"5px\",\n        minWidth: \"20px\",\n        height: \"20px\",\n        padding: \"0 5px\",\n        borderRadius: \"10px\",\n        background: \"rgba(255,255,255,.94)\",\n        color: \"#202124\",\n        fontSize: \"12px\",\n        lineHeight: \"20px\",\n        textAlign: \"center\",\n        fontWeight: \"700\",\n      });\n      media.appendChild(number);\n\n      const content = document.createElement(\"div\");\n      const name = document.createElement(\"strong\");\n      name.textContent = place.name;\n      Object.assign(name.style, { display: \"block\", fontSize: \"14px\", lineHeight: \"1.3\" });\n\n      const meta = document.createElement(\"div\");\n      const distance = place.distanceMeters < 1000\n        ? place.distanceMeters + \" m\"\n        : (place.distanceMeters / 1000).toFixed(1) + \" km\";\n      meta.textContent = [distance, place.category, place.address].filter(Boolean).join(\" · \ ");\n      Object.assign(meta.style, {\n        marginTop: \"5px\",\n        color: \"#5f6368\",\n        fontSize: \"12px\",\n        lineHeight: \"1.35\",\n        display: \"-webkit-box\",\n        WebkitLineClamp: \"2\",\n        WebkitBoxOrient: \"vertical\",\n        overflow: \"hidden\",\n      });\n      content.appendChild(name);\n      content.appendChild(meta);\n      button.appendChild(media);\n      button.appendChild(content);\n\n      button.addEventListener(\"click\", () => {\n        holder.frame.src = buildNuboMapsEmbedUrl(place.name, location, {\n          latitude: place.lat,\n          longitude: place.lng,\n        });\n      });\n      card.appendChild(button);\n\n      const links = document.createElement(\"div\");\n      Object.assign(links.style, {\n        display: \"flex\",\n        gap: \"12px\",\n        marginTop: \"7px\",\n        paddingLeft: \"96px\",\n        fontSize: \"12px\",\n      });\n\n      const mapsLink = document.createElement(\"a\");\n      mapsLink.href = place.mapsUrl;\n      mapsLink.target = \"_blank\";\n      mapsLink.rel = \"noopener noreferrer\";\n      mapsLink.textContent = \"Google Maps\";\n      links.appendChild(mapsLink);\n\n      if (place.website) {\n        const websiteLink = document.createElement(\"a\");\n        websiteLink.href = place.website;\n        websiteLink.target = \"_blank\";\n        websiteLink.rel = \"noopener noreferrer\";\n        websiteLink.textContent = \"官網\";\n        links.appendChild(websiteLink);\n      }\n\n      card.appendChild(links);\n      holder.listBody.appendChild(card);\n    });`;

  source = source.replace(renderPattern, renderReplacement);
  fs.writeFileSync(path, source);
}

console.log('Applied Maps V3 image cards, links and faster first paint');
