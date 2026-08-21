import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
const marker = 'NUBO_MAPS_TEXT_CONTRAST_V7';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes(marker)) {
  if (!source.includes('NUBO_MAPS_CARD_LIST_V3')) {
    throw new Error('maps v7 requires NUBO_MAPS_CARD_LIST_V3');
  }

  source = source.replace(
    '// NUBO_MAPS_CARD_LIST_V3',
    `// NUBO_MAPS_CARD_LIST_V3\n// ${marker}`,
  );

  const nameAnchor = `      content.appendChild(name);`;
  const nameReplacement = `      name.style.setProperty("color", "#111827", "important");\n      name.style.setProperty("-webkit-text-fill-color", "#111827", "important");\n      name.style.setProperty("opacity", "1", "important");\n      name.style.setProperty("visibility", "visible", "important");\n      name.style.setProperty("font-size", "16px", "important");\n      name.style.setProperty("font-weight", "800", "important");\n      name.style.setProperty("white-space", "normal", "important");\n      name.style.setProperty("display", "-webkit-box", "important");\n      name.style.setProperty("-webkit-line-clamp", "2", "important");\n      name.style.setProperty("-webkit-box-orient", "vertical", "important");\n      name.style.setProperty("overflow", "hidden", "important");\n      content.appendChild(name);`;
  if (!source.includes(nameAnchor)) throw new Error('maps v7 name anchor missing');
  source = source.replace(nameAnchor, nameReplacement);

  const ratingAnchor = `        content.appendChild(rating);`;
  const ratingReplacement = `        rating.style.setProperty("color", "#9a4d00", "important");\n        rating.style.setProperty("-webkit-text-fill-color", "#9a4d00", "important");\n        rating.style.setProperty("opacity", "1", "important");\n        rating.style.setProperty("visibility", "visible", "important");\n        content.appendChild(rating);`;
  if (!source.includes(ratingAnchor)) throw new Error('maps v7 rating anchor missing');
  source = source.replace(ratingAnchor, ratingReplacement);

  const metaAnchor = `      content.appendChild(meta);`;
  const metaReplacement = `      meta.style.setProperty("color", "#374151", "important");\n      meta.style.setProperty("-webkit-text-fill-color", "#374151", "important");\n      meta.style.setProperty("opacity", "1", "important");\n      meta.style.setProperty("visibility", "visible", "important");\n      content.appendChild(meta);`;
  if (!source.includes(metaAnchor)) throw new Error('maps v7 meta anchor missing');
  source = source.replace(metaAnchor, metaReplacement);

  const styleLinkAnchor = `      const styleLink = (link: HTMLAnchorElement) => {\n        Object.assign(link.style, {`;
  const styleLinkReplacement = `      const styleLink = (link: HTMLAnchorElement) => {\n        link.style.setProperty("color", "#0b57d0", "important");\n        link.style.setProperty("-webkit-text-fill-color", "#0b57d0", "important");\n        link.style.setProperty("opacity", "1", "important");\n        link.style.setProperty("visibility", "visible", "important");\n        Object.assign(link.style, {`;
  if (!source.includes(styleLinkAnchor)) throw new Error('maps v7 link anchor missing');
  source = source.replace(styleLinkAnchor, styleLinkReplacement);

  const attributionAnchor = `        links.appendChild(attribution);`;
  const attributionReplacement = `        attribution.style.setProperty("color", "#6b7280", "important");\n        attribution.style.setProperty("-webkit-text-fill-color", "#6b7280", "important");\n        attribution.style.setProperty("opacity", "1", "important");\n        links.appendChild(attribution);`;
  if (!source.includes(attributionAnchor)) throw new Error('maps v7 attribution anchor missing');
  source = source.replace(attributionAnchor, attributionReplacement);

  fs.writeFileSync(toolsPath, source);
}

console.log('Applied Maps V7 forced high-contrast merchant text');
