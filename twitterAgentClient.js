import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Scraper, SearchMode } from "agent-twitter-client";
import fs from "fs";
import path from "path";

// Load environment variables from .env file
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scraper = new Scraper();
let isLoggedIn = false;
let loginAttempts = 0;
const MAX_LOGIN_ATTEMPTS = 3;

const username = process.env.TEST_ACCOUNT_X_USERNAME;
const password = process.env.TEST_ACCOUNT_X_PASSWORD;
const authToken = process.env.TWITTER_COOKIES_AUTH_TOKEN;
const ct0 = process.env.TWITTER_COOKIES_CT0;
const guestId = process.env.TWITTER_COOKIES_GUEST_ID;

async function setCookiesFromArray(cookiesArray) {
  const cookieStrings = cookiesArray.map(
    (cookie) =>
      `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${
        cookie.path
      }; ${cookie.secure ? "Secure" : ""}; ${
        cookie.httpOnly ? "HttpOnly" : ""
      }; SameSite=${cookie.sameSite || "Lax"}`
  );
  await scraper.setCookies(cookieStrings);
}

async function ensureLoggedIn() {
  if (!isLoggedIn && loginAttempts < MAX_LOGIN_ATTEMPTS) {
    console.log("🔑 Logging into Twitter...");
    try {
      const useCookieAuth = process.env.TWITTER_USE_COOKIE_AUTH === "true";
      console.log("🚀 ~ ensureLoggedIn ~ useCookieAuth:", useCookieAuth);

      if (useCookieAuth) {
        // Get cookies from environment
        if (!authToken) {
          throw new Error(
            "Twitter cookies not configured in environment variables"
          );
        }

        const createTwitterCookies = (authToken, ct0, guestId) =>
          authToken && ct0 && guestId
            ? [
                { key: "auth_token", value: authToken, domain: ".twitter.com" },
                { key: "ct0", value: ct0, domain: ".twitter.com" },
                { key: "guest_id", value: guestId, domain: ".twitter.com" },
              ]
            : null;

        const formattedCookies = createTwitterCookies(authToken, ct0, guestId);
        console.log("formattedCookies:: ", formattedCookies);

        // Set cookies for authentication
        console.log(`Authenticating with cookies...`);
        await setCookiesFromArray(formattedCookies);

        // Verify login status
        if (await scraper.isLoggedIn()) {
          const profile = await scraper.me();
          isLoggedIn = true;
          loginAttempts = 0; // Reset attempts on successful login
          console.log("🚀 ~ ensureLoggedIn ~ profile:", profile);
          console.log(
            `Successfully logged in to Twitter as ${
              profile?.displayName || "user"
            } using cookies`
          );
        } else {
          throw new Error("Failed to authenticate with cookies");
        }
      } else {
        await scraper.login(username, password);
        isLoggedIn = true;
        loginAttempts = 0; // Reset attempts on successful login
        console.log(
          "✅ Successfully logged into Twitter WITH ONLY USERNAME AND PASSWORD"
        );
      }
    } catch (error) {
      loginAttempts++;
      console.error("❌ Failed to login to Twitter:", error.message);
      if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        console.log(
          "⚠️ Maximum login attempts reached. Please try again later."
        );
        return false;
      }
      return false;
    }
  }
  return isLoggedIn;
}

export async function sendTweet(tweetMessage, media = null) {
  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) {
      console.log("⚠️ Skipping tweet due to login issues");
      return false;
    }
    if (media) {
      console.log("🐦 Sending tweet with media...");
      const mediaData = [
        {
          data: fs.readFileSync(path.join(__dirname, "..", "..", "output.mp4")),
          mediaType: "video/mp4",
        },
      ];
      await scraper.sendTweet("", null, mediaData);
    } else {
      console.log("🐦 Sending tweet...");

      await scraper.sendTweet(tweetMessage);
    }
    console.log("✅ Tweet sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Error sending tweet:", error.message);
    // If we get an auth error, try logging in again

    return false;
  }
}

export async function replyToTweet(tweetMessage, tweetId, media = null) {
  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) {
      console.log("⚠️ Skipping tweet due to login issues");
      return false;
    }
    console.log("🐦 Sending tweet...");
    if (!tweetId) {
      console.log("⚠️ No tweet ID provided");
      return false;
    }

    if (media) {
      console.log("🐦 Sending tweet with media...");
      const mediaData = [
        {
          data: fs.readFileSync(path.join(__dirname, "..", "..", "output.mp4")),
          mediaType: "video/mp4",
        },
      ];
      await scraper.sendTweet(tweetMessage, tweetId, mediaData);
    } else {
      await scraper.sendTweet(tweetMessage, tweetId);
    }

    console.log("✅ Tweet sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Error sending tweet:", error.message);
    // If we get an auth error, try logging in again
    if (error.message.includes("auth") || error.message.includes("login")) {
      console.log("🔄 Auth error detected, attempting to relogin...");
      isLoggedIn = false;
      loginAttempts = 0; // Reset attempts for retry
      const loggedIn = await ensureLoggedIn();
      if (loggedIn) {
        // Retry sending the tweet
        if (tweetId) {
          await scraper.sendTweet(tweetMessage, tweetId);
        } else {
          await scraper.sendTweet(tweetMessage);
        }
        console.log("✅ Tweet sent successfully after relogin");
        return true;
      }
    }
    return false;
  }
}

export async function replyToTweetWithMedia(tweetId = null) {
  try {
    const tweetMessage = "";
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) {
      console.log("⚠️ Skipping tweet due to login issues");
      return false;
    }
    const mediaData = [
      {
        data: fs.readFileSync(path.join(__dirname, "..", "..", "output.mp4")),
        mediaType: "video/mp4",
      },
    ];
    console.log("🐦 Sending tweet with media...");
    if (tweetId) {
      await scraper.sendTweet(tweetMessage, tweetId, mediaData);
    } else {
      await scraper.sendTweet(tweetMessage, null, mediaData);
    }
    console.log("✅ Tweet with media sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Error sending tweet with media:", error.message);
    // If we get an auth error, try logging in again
    if (error.message.includes("auth") || error.message.includes("login")) {
      console.log("🔄 Auth error detected, attempting to relogin...");
      isLoggedIn = false;
      loginAttempts = 0; // Reset attempts for retry
      const loggedIn = await ensureLoggedIn();
      if (loggedIn) {
        // Retry sending the tweet
        if (tweetId) {
          await scraper.sendTweet(tweetMessage, tweetId, mediaData);
        } else {
          await scraper.sendTweet(tweetMessage, null, mediaData);
        }
        console.log("✅ Tweet with media sent successfully after relogin");
        return true;
      }
    }
    return false;
  }
}

export async function getLatestTweets(numberOfTweets = 1, searchTerm) {
  const loggedIn = await ensureLoggedIn();
  if (!loggedIn) {
    console.log("⚠️ Skipping tweet due to login issues");
    return false;
  }
  const tweets = await scraper.searchTweets(
    searchTerm,
    numberOfTweets,
    SearchMode.Latest
  );
  console.log("🚀 ~ getLatestTweet ~ tweets:", tweets);
  const tweetsArray = [];
  // Loop through the AsyncGenerator
  for await (const tweet of tweets) {
    console.log("📝 Tweet content:", tweet);
    tweetsArray.push(tweet);
  }

  return tweetsArray; // Return null if no tweets found
}

export async function getTweetById(tweetId) {
  console.log(`🔍 Fetching tweet with ID: ${tweetId}...`);
  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) {
      console.log("⚠️ Skipping tweet fetch due to login issues");
      return null;
    }
    console.log("🐦 Making API request to fetch tweet...");
    const tweet = await scraper.getTweet(tweetId);
    console.log("🚀 ~ getTweetById ~ tweet:", tweet);
    return tweet;
  } catch (error) {
    console.error("❌ Error fetching tweet by ID:", error.message);
    // If we get an auth error, try logging in again
    if (error.message.includes("auth") || error.message.includes("login")) {
      console.log("🔄 Auth error detected, attempting to relogin...");
      isLoggedIn = false;
      loginAttempts = 0; // Reset attempts for retry
      const loggedIn = await ensureLoggedIn();
      if (loggedIn) {
        // Retry getting the tweet
        console.log("🔄 Retrying tweet fetch after relogin...");
        const tweets = await scraper.getTweet(tweetId);
        if (tweets && tweets[0]) {
          console.log("✅ Successfully fetched tweet after relogin");
          return tweets[0];
        }
      }
    }
    console.log("❌ Failed to fetch tweet, returning null");
    return null;
  }
}

export async function getTweetsBySearchTerm(searchTerm, numberOfTweets) {
  console.log(`🔍 Fetching tweets with search terms: ${searchTerm}...`);
  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) {
      console.log("⚠️ Skipping tweet fetch due to login issues");
      return null;
    }
    let foundTweets = [];
    console.log(
      "🐦 getTweetsBySearchTerm Making API request to fetch tweet..."
    );
    const tweets = await scraper.searchTweets(
      searchTerm,
      numberOfTweets,
      SearchMode.Latest
    );
    for await (const tweet of tweets) {
      foundTweets.push(tweet);
    }

    return foundTweets;
  } catch (error) {
    console.error("❌ Error fetching tweet by ID:", error.message);
    // If we get an auth error, try logging in again
    if (error.message.includes("auth") || error.message.includes("login")) {
      console.log("🔄 Auth error detected, attempting to relogin...");
      isLoggedIn = false;
      loginAttempts = 0; // Reset attempts for retry
      const loggedIn = await ensureLoggedIn();
      if (loggedIn) {
        // Retry getting the tweet
        console.log("🔄 Retrying tweet fetch after relogin...");
        const tweets = await scraper.getTweet(tweetId);
        if (tweets && tweets[0]) {
          console.log("✅ Successfully fetched tweet after relogin");
          return tweets[0];
        }
      }
    }
    console.log("❌ Failed to fetch tweet, returning null");
    return null;
  }
}

export async function getTwitterProfile(username) {
  const loggedIn = await ensureLoggedIn();
  if (!loggedIn) {
    console.log("⚠️ Skipping tweet fetch due to login issues");
    return null;
  }
  const profile = await scraper.getProfile(username);

  console.log("🚀 ~ getTwitterProfile ~ profile:", profile);
  return profile;
}

// // Test the getTweetById function
// (async () => {
//   try {
//     console.log("Starting tweet fetch test...");
//     const result = await getTweetById("1925220891408904353");
//     console.log("Final result:", result);
//   } catch (error) {
//     console.error("Error in test:", error);
//   }
// })();

// console.log("REMOVE ME!!!! ");
// console.log("REMOVE ME!!!! ");
// console.log("REMOVE ME!!!! ");
// console.log("REMOVE ME!!!! ");
