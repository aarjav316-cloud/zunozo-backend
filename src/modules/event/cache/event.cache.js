import { redisClient } from "../../../config/redis.js";

const APPROVED_EVENTS_KEY = "approved_events";
const CACHE_TTL = 300;

export const getApprovedEventsCache = async() => {
    const cachedEvents = await redisClient.get(APPROVED_EVENTS_KEY);

    if(!cachedEvents) {
        return null;
    }

    return JSON.parse(cachedEvents);
};

export const setApprovedEventCache = async() => {
    await redisClient.set(
        APPROVED_EVENTS_KEY,
        JSON.stringify(events),
        {
            EX:CACHE_TTL,
        }
    )
}

export const invalidateApprovedEventsCache = async () => {
  await redisClient.del(APPROVED_EVENTS_KEY);
};

export const getEventCache = async(slug) => {
    const cachedEvent = await redisClient.get(`event:${slug}`)

    if (!cachedEvent) {
      return null;
    }

   return JSON.parse(cachedEvent);
};

export const setEventCache = async (slug, event) => {
  await redisClient.set(
    `event:${slug}`,
    JSON.stringify(event),
    {
      EX: CACHE_TTL,
    }
  );
};

export const invalidateEventCache = async (slug) => {
  await redisClient.del(`event:${slug}`);
};