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



