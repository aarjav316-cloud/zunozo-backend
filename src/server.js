import express from "express";
import dotenv from "dotenv"
import connectDb from "./config/db.js";
import { connectRedis } from "./config/redis.js";

dotenv.config();

const app = express();

app.use(express.json());



app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {

        await connectDb();
        await connectRedis();

        app.listen(PORT , () => {
            console.log(`Server running on ${PORT}`);
        });
        
    } catch (error) {

        console.log(error);
        
    }
};

startServer();

