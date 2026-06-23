import { redisClient } from "../config/redis.js";

export const createRateLimiter = (limit , windowSeconds) => {
    return async (req,res,next) => {
        try {

            const ip = req.ip;

            const key = `rate-limit:${ip}:${req.path}`;

            const currentCount =  await redisClient.incr(key);

            if(currentCount === 1){
                await redisClient.expire(
                    key,
                    windowSeconds
                )
            }

             if (currentCount > limit) {

                 return res.status(429).json({
                   success: false,
                   message:
                     "Too many requests. Please try again later.",
                });
            }

            next();
            
        } catch (error) {

            console.log(error)

            next();
            
        }
    }
}



export const loginLimiter =
createRateLimiter(
  5,
  15 * 60
);

export const registerLimiter =
createRateLimiter(
  3,
  5 * 60
);

export const otpLimiter =
createRateLimiter(
  10,
  5 * 60
);