import mongoose from 'mongoose';
import { env } from './env.js';
import dns from 'dns';

// Override default Node.js DNS resolution to use Google Public DNS
dns.setServers(['8.8.8.8', '8.8.4.4']);
export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected (${mongoose.connection.name})`);
}
