import { generateDefaultStampImages, getDefaultStampImageUrl } from "../lib/stampHeroImage.js";

const args = process.argv.slice(2);
const templateId = args[0];
const maxPoints = args[1] ? Number.parseInt(args[1], 10) : 10;
if (!templateId) {
  console.error("Usage: tsx src/scripts/generateDefaultStamps.ts <templateId> [maxPoints]");
  process.exit(1);
}

if (Number.isNaN(maxPoints) || maxPoints <= 0) {
  console.error("maxPoints must be a positive number.");
  process.exit(1);
}

await generateDefaultStampImages({
  templateId,
  maxPoints,
});

console.log("Default stamp images generated:");
for (let index = 1; index <= maxPoints; index += 1) {
  console.log(
    `#${index}`,
    getDefaultStampImageUrl(templateId, true, index),
    getDefaultStampImageUrl(templateId, false, index)
  );
}
