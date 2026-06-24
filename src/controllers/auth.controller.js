import User from "../models/user.model.js";
import generateOTP from "../utils/generateOTP.js";
import bcrypt from 'bcryptjs'
import { redisClient } from "../config/redis.js";
import sendEmail from "../services/email.service.js";

import jwt from "jsonwebtoken";
import { generateAccessToken , generateRefreshToken } from "../utils/generateToken.js";



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
   
       const existingPendingUser = await redisClient.get(
       `register:${email}`
   );
   
   if (existingPendingUser) {
       return res.status(400).json({
         success: false,
         message: "OTP already sent. Please verify your email first.",
        });
    }

    const otp = generateOTP();

    const hashedPassword = await bcrypt.hash(password, 10);

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


export const verifyOTP = async (req,res) => {
    try {

        const { email, otp } = req.body;

        if (!email || !otp) {
           return res.status(400).json({
           success: false,
           message: "Email and OTP are required",
      });
    }

    const pendingUser = await redisClient.get(
      `register:${email}`
    );

    if (!pendingUser) {
        return res.status(400).json({
           success: false,
           message: "OTP expired or user not found",
       });
    };

    const userData = JSON.parse(pendingUser);

    if (userData.otp !== otp) {
      return res.status(400).json({
       success: false,
       message: "Invalid OTP",
     });
    }

    const existingUser = await User.findOne({
       email: userData.email,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const user = await User.create({
       name: userData.name,
       email: userData.email,
       password: userData.password,
    });

     await redisClient.del(`register:${email}`);



      return res.status(200).json({
      success: true,
      message: "OTP Verified , Account created successfully ",
    });


        
    } catch (error) {

         console.log(error);

        return res.status(500).json({
          success: false,
          message: "Server Error",
        });
        
    }
}

export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const pendingUser = await redisClient.get(`register:${email}`);

    if (!pendingUser) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired. Please sign up again.",
      });
    }

    const userData = JSON.parse(pendingUser);

    const newOtp = generateOTP();

    userData.otp = newOtp;

    await redisClient.set(
      `register:${email}`,
      JSON.stringify(userData),
      {
        EX: 300,
      }
    );

    await sendEmail({
      to: email,
      subject: "Your New OTP for Zunozo",
      html: `
        <h2>Zunozo Email Verification</h2>
        <p>Your new OTP is:</p>
        <h1>${newOtp}</h1>
        <p>This OTP will expire in 5 minutes.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.log("Resend OTP Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const login = async (req,res) => {
    try {

        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });
        }

        const user = await User.findOne({ email });

        if (!user || user.isDeleted) {
          return res.status(400).json({
            success: false,
            message: "Account not found",
          });
        }

        const isPasswordCorrect = await bcrypt.compare(
          password,
          user.password
        );
        
        if (!isPasswordCorrect) {
          return res.status(400).json({
            success: false,
            message: "Invalid credentials",
          });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);


        user.refreshToken = refreshToken;

        await user.save({
             validateBeforeSave: false,
        });

        const cookieOptions = {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
        };

        res.cookie("accessToken", accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000,
        });
        
        res.cookie("refreshToken", refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
           success: true,
           message: "Login successful",

           user: {
             id: user._id,
             name: user.name,
             email: user.email,
           },
        });
        
    } catch (error) {
         console.log(error);

         return res.status(500).json({
            success: false,
            message: "Server Error",
         });
    }
}

//logout controller v1

export const logout = async (req, res) => {
  try {

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.refreshToken = null;

    await user.save({
      validateBeforeSave: false,
    });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


export const refreshAccessToken = async (req, res) => {
  try {

    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
          return res.status(401).json({
            success: false,
            message: "Refresh token missing",
        });
    }

    const decoded = jwt.verify(
       refreshToken,
       process.env.JWT_REFRESH_SECRET
    );

    const user = await User.findById(decoded.id);

    if (
      !user ||
      user.isDeleted ||
      user.refreshToken !== refreshToken
    ){
        return res.status(401).json({
          success: false,
          message: "Invalid refresh token",
        });
    }

    const newAccessToken = generateAccessToken(user);

    const newRefreshToken = generateRefreshToken(user);

    user.refreshToken = newRefreshToken;

    await user.save({
      validateBeforeSave: false,
    });

    res.cookie(
      "accessToken",
      newAccessToken,
      {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 15 * 60 * 1000,
      }
    );


    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
       success: true,
       message: "Tokens refreshed successfully",
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


export const getMe = async (req, res) => {
  try {

    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
      },
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


export const googleCallback = async(req,res) => {
  try {

     const user = req.user;

     if(!user || user.isDeleted){
      return res.status(403).json({
        success:false,
        message:"this account has been deleted"
      })
     }

    const accessToken =
      generateAccessToken(user);

    const refreshToken =
      generateRefreshToken(user);

    user.refreshToken =
      refreshToken;


         await user.save({
      validateBeforeSave: false,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    };

    res.cookie(
      "accessToken",
      accessToken,
      {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000,
      }
    );

    res.cookie(
      "refreshToken",
      refreshToken,
      {
        ...cookieOptions,
        maxAge:
          7 * 24 * 60 * 60 * 1000,
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "Google Login Successful",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
    
  } catch (error) {
        console.log(error);

       return res.status(500).json({
         success: false,
         message: "Server Error",
       });
  }
}


export const forgotpassword = async(req,res) => {
  try {

    const {email} = req.body;

    if(!email){
      return res.status(400).json({
        success:false,
        message:"email is required"
      })
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();

    console.log(otp);


    await redisClient.set(
      `forgot-password:${email}`,
      otp,
      {
        EX: 300,
      }
    );

    await sendEmail({
         to: email,
       
         subject: "Reset Password OTP",
       
         html: `
           <h2>Password Reset Request</h2>
       
           <p>Your OTP is:</p>
       
           <h1>${otp}</h1>
       
           <p>This OTP will expire in 5 minutes.</p>
         `,
    });
    
  } catch (error) {
     return res.json({
       success:false,
       message:error.message
     })
  }
}


export const resetPassword = async(req,res) => {
    try {

       const {email , otp , newPassword} = req.body;

       if (
         !email ||
         !otp ||
         !newPassword
       ) {
         return res.status(400).json({
           success: false,
           message: "All fields are required",
        });
       }

       const storedOTP = await redisClient.get(`forgot-password:${email}`);

       if (!storedOTP) {
        return res.status(400).json({
          success: false,
          message: "OTP expired",
        });
      }

      if (
        storedOTP.toString() !==
        otp.toString()
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      const user =
        await User.findOne({
         email,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hashedPassword =
        await bcrypt.hash(
          newPassword,
          10
      );

      user.password = hashedPassword;

      await user.save();

      await redisClient.del(`forgot-password:${email}`);

      return res.status(200).json({
        success: true,
        message:"Password reset successfully",
      });
      
    } catch (error) {
      
    }
}


export const changePassword = async (req,res) => {
  try {

    const {oldPassword , newPassword} = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

     const user =  await User.findById( req.user._id);

     const isPasswordCorrect =  await bcrypt.compare(oldPassword,user.password );

     if (!isPasswordCorrect) {
        return res.status(400).json({
          success: false,
          message:
            "Old password is incorrect",
        });
     }

     if (oldPassword ===  newPassword) {

       return res.status(400).json({
         success: false,
         message:
           "New password must be different",
       });

     }

     const hashedPassword = await bcrypt.hash(newPassword , 10);

     user.password = hashedPassword;

     await user.save({
      validateBeforeSave: false,
     });

      res.clearCookie(
        "accessToken"
      );
      
      res.clearCookie(
        "refreshToken"
      );

      return res.status(200).json({
        success: true,
        message:
          "Password changed successfully. Please login again.",
      });
    
  } catch (error) {
     
  }
}


export const deleteAccount = async (req,res) => {
  try {

    const {password} = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );
    
    if (!isPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: "Incorrect password",
      });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.refreshToken = null;

    await user.save({
      validateBeforeSave: false,
    });

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");


    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
    
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
}


