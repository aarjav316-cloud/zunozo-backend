import User from "../models/user.model.js";
import generateOTP from "../utils/generateOTP.js";
import bcrypt from 'bcryptjs'
import { redisClient } from "../config/redis.js";
import sendEmail from "../services/email.service.js";



export const register = async (req, res) => {
  try {

    const { name, email, password } = req.body;

    if (!name || !email || !password) {

         return res.status(400).json({
         success: false,
         message: "All fields are required",
         });

    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }
    const otp = generateOTP();

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed Password:", hashedPassword);

    console.log(otp);

    const userData = {
          name,
          email,
          password: hashedPassword,
          otp,
    };

    await redisClient.set(

      `register:${email}`,
      JSON.stringify(userData),

      {
        EX: 300,
      }

    );

    const redisData = await redisClient.get(`register:${email}`);

    console.log("Redis Data:", JSON.parse(redisData));

    await sendEmail({
       to: email,
       subject: "Email Verification OTP",
       html: `
         <h2>Welcome to Zunozo 🎉</h2>
         <p>Your OTP is:</p>
     
         <h1>${otp}</h1>
     
         <p>This OTP will expire in 5 minutes.</p>
       `,
    });

    return res.status(200).json({
       success: true,
       message: "OTP sent successfully",
    });

   
   
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};




