import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
const marker = 'NUBO_MAPS_TITLE_CONTRAST_V7';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes(marker)) {
  if (!source.includes('NUBO_MAPS_LOCATION_PERF_V6')) {
    throw new Error('maps v7 requires NUBO_MAPS_LOCATION_PERF_V6');
  }

  source = source.replace(
    '// NUBO_MAPS_LOCATION_PERF_V6',
    `// NUBO_MAPS_LOCATION_PERF_V6\n// ${marker}`,
  );

  const nameBlockPattern = /      const name = document\.createElement\(\"strong\"\);[\s\S]*?      content\.appendChild\(name\);/;
  if (!nameBlockPattern.test(source)) {
    throw new Error('maps v7 title block missing');
  }

  source = source.replace(
    nameBlockPattern,
    `      const name = document.createElement("strong");\n      name.textContent = placeName;\n      Object.assign(name.style, {\n        fontSize: "16px",\n        fontWeight: "800",\n        lineHeight: "1.32",\n        whiteSpace: "normal",\n        overflow: "hidden",\n        textOverflow: "ellipsis",\n        WebkitLineClamp: "2",\n        WebkitBoxOrient: "vertical",\n      });\n      // NUBO global button/theme rules can carry !important text colors.\n      // Force merchant titles to remain readable on the white Maps card.\n      name.style.setProperty("display", "-webkit-box", "important");\n      name.style.setProperty("color", "#111827", "important");\n      name.style.setProperty("-webkit-text-fill-color", "#111827", "important");\n      name.style.setProperty("opacity", "1", "important");\n      name.style.setProperty("visibility", "visible", "important");\n      name.style.setProperty("filter", "none", "important");\n      content.style.setProperty("color", "#111827", "important");\n      content.style.setProperty("-webkit-text-fill-color", "#111827", "important");\n      button.style.setProperty("opacity", "1", "important");\n      content.appendChild(name);`,
  );

  if (!source.includes(marker)) throw new Error('maps v7 marker missing');
  if (!source.includes('name.style.setProperty("-webkit-text-fill-color", "#111827", "important")')) {
    throw new Error('maps v7 title contrast patch missing');
  }

  fs.writeFileSync(toolsPath, source);
}

console.log('Applied Maps V7 high-contrast two-line merchant titles');
