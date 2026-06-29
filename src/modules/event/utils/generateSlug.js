import Event from "../models/event.model";


const generateSlug = async (title) => {
  // Convert title into URL-friendly slug
  const baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-");    // Replace spaces with -

  let slug = baseSlug;
  let counter = 2;

  // Check if slug already exists
  while (await Event.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

export default generateSlug;




