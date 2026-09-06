import mongoose from 'mongoose'

const connectDb = async () => {
    try {
        const uri = process.env.MONGO_URI;

        if (!uri) {
            throw new Error("MONGO_URI environment variable is not defined");
        }

        // Log a redacted version so we can verify it's well-formed
        const redacted = uri.substring(0, 20) + "..." + uri.substring(uri.length - 15);
        console.log("[DB] MONGO_URI present:", redacted);
        console.log("[DB] Calling mongoose.connect()...");

        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,  // 10s timeout instead of 30s default
        });

        console.log("[DB] MongoDB connected to:", conn.connection.host);

    } catch (error) {
        console.log("[DB] MongoDB connection FAILED:", error.message);
        console.log("[DB] Full error:", error.stack);
        throw error;
    }
}
export default connectDb;