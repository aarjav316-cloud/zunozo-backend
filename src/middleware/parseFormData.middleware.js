/**
 * Middleware to parse FormData fields back to proper types.
 * When multipart/form-data is used, all fields arrive as strings after multer parsing.
 * This converts JSON-stringified objects/arrays and numeric/boolean fields
 * so Zod validation works correctly.
 * 
 * This middleware should run AFTER multer but BEFORE validate.
 */
export const parseFormDataFields = (req, res, next) => {
  // Only process if multer ran (i.e., the request contained multipart data)
  // We detect this by checking if req.file exists or if content-type was multipart
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data") && !req.file) {
    return next();
  }

  const body = req.body;

  for (const key of Object.keys(body)) {
    const value = body[key];

    // Skip non-string values (already parsed)
    if (typeof value !== "string") continue;

    // Try to parse JSON objects/arrays (e.g. venue, tags, galleryImages)
    if (
      (value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))
    ) {
      try {
        body[key] = JSON.parse(value);
        continue;
      } catch {
        // Not valid JSON, keep as string
      }
    }

    // Boolean conversion
    if (value === "true") {
      body[key] = true;
      continue;
    }
    if (value === "false") {
      body[key] = false;
      continue;
    }

    // Numeric conversion for known numeric fields
    const numericFields = ["capacity", "price", "maxTicketsPerBooking"];
    if (numericFields.includes(key)) {
      const num = Number(value);
      if (!isNaN(num) && value.trim() !== "") {
        body[key] = num;
      }
    }
  }

  next();
};
