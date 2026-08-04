//cache file
import { redisClient } from "../../../config/redis.js";

const BOOKING_CACHE_TTL = 60 * 5;


export const bookingCacheKeys = {
  booking: (bookingId) => `booking:${bookingId}`,

  userBookings: (userId, page, limit) =>
    `booking:user:${userId}:page:${page}:limit:${limit}`,

  organizerBookings: (organizerId, page, limit) =>
    `booking:organizer:${organizerId}:page:${page}:limit:${limit}`,

  eventBookings: (eventId, page, limit) =>
    `booking:event:${eventId}:page:${page}:limit:${limit}`,

  allBookings: (page, limit) =>
    `booking:all:page:${page}:limit:${limit}`,
};


export const getCache = async (key) => {
  const data = await redisClient.get(key);

  if (!data) return null;

  return JSON.parse(data);
};


export const setCache = async (
  key,
  value,
  ttl = BOOKING_CACHE_TTL
) => {
  await redisClient.set(key, JSON.stringify(value), {
    EX: ttl,
  });
};



export const deleteCache = async (key) => {
  await redisClient.del(key);
};



export const invalidateBookingCache = async ({
  bookingId,
  userId,
  organizerId,
  eventId,
}) => {
  const keys = [];

  if (bookingId) {
    keys.push(bookingCacheKeys.booking(bookingId));
  }

  if (userId) {
    keys.push(`booking:user:${userId}*`);
  }

  if (organizerId) {
    keys.push(`booking:organizer:${organizerId}*`);
  }

  if (eventId) {
    keys.push(`booking:event:${eventId}*`);
  }

  keys.push("booking:all*");

  for (const pattern of keys) {
    const matchedKeys = await redisClient.keys(pattern);

    if (matchedKeys.length) {
      await redisClient.del(matchedKeys);
    }
  }
};



