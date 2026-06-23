import passport from "passport";
import {Strategy as GoogleStrategy} from "passport-google-oauth20"

import User from "../models/user.model.js";

        console.log(process.env.GOOGLE_CLIENT_ID);
        console.log(process.env.GOOGLE_CLIENT_SECRET);


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,

      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET,

      callbackURL:
        process.env.GOOGLE_CALLBACK_URL,
    },

    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {

        console.log("GOOGLE CALLBACK HIT");
        console.log(profile.displayName);
        console.log(profile.emails[0].value);


        let user = await User.findOne({
          email: profile.emails[0].value,
        });

        if (!user) {

          user = await User.create({
            googleId: profile.id,

            name: profile.displayName,

            email:
              profile.emails[0].value,
          });

        }


        return done(null, user);

      } catch (error) {

        return done(error, null);

      }
    }
  )
);

export default passport;




