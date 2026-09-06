import mongoose from 'mongoose'

const connectDb = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI environment variable is not defined");
        }

        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDb connected");
        
    } catch (error) {
        console.error("MongoDB connection failed:", error);
        throw error;
    }
}
export default connectDb;