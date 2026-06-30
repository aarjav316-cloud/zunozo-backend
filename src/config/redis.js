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
    await redisClient.connect();
}

export {redisClient , connectRedis};







