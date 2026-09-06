import {createClient} from "redis";

const redisClient = createClient({
    url:process.env.REDIS_URL,
});

redisClient.on("error" , (err) => {
    console.log("Redis Error:", err);
});

redisClient.on("connect" , () => {
    console.log("Redis Connected");
});

const connectRedis = async () => {
    if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL environment variable is not defined");
    }
    await redisClient.connect();
}

export {redisClient , connectRedis};







