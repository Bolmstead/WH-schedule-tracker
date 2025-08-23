import axios from "axios";
import { sendTweet } from "./twitterAgentClient.js";
import http from "http";

// API endpoint
const API_URL = "https://media-cdn.factba.se/rss/json/trump/calendar-full.json";

// Heroku requires a web server to keep the dyno alive
const PORT = process.env.PORT || 3000;

// Variables to store parsed data
let scheduleData = [];
let latestEvents = [];
let todayEvents = [];
let upcomingEvents = [];

// Variables to track previous state for new event detection
let previousScheduleData = [];
let isFirstFetch = true;

/**
 * Fetches the Trump calendar data from the API
 */
async function fetchCalendarData() {
  try {
    const response = await axios.get(API_URL);
    const data = response.data;

    // Filter current data to latest 14 days
    const filteredCurrentData = filterToLatest14Days(data);

    // Check for new events (only within the 14-day window)
    const newEvents = detectNewEvents(filteredCurrentData);

    if (isFirstFetch) {
      console.log(
        `[${new Date().toISOString()}] Initial fetch completed - tracking ${
          filteredCurrentData.length
        } events from the latest 14 days (${data.length} total events in API)`
      );
      isFirstFetch = false;
    } else if (newEvents.length > 0) {
      console.log(`[${new Date().toISOString()}] NEW EVENTS DETECTED!`);
      console.log(`Found ${newEvents.length} new event(s):\n`);

      // Display new events
      newEvents.forEach((event, index) => {
        console.log(`NEW EVENT ${index + 1}:`);
        console.log(`Date: ${event.date}`);
        console.log(`Time: ${event.time_formatted || "No time specified"}`);
        console.log(`Details: ${event.details}`);
        console.log(`Location: ${event.location}`);
        console.log(`Type: ${event.type}`);
        console.log(`Coverage: ${event.coverage || "None"}`);
        if (event.url) console.log(`Transcript URL: ${event.url}`);
        if (event.video_url) console.log(`Video URL: ${event.video_url}`);
        console.log("-----------------------------------");
      });
      console.log(
        `Total events in 14-day window: ${filteredCurrentData.length}`
      );
      console.log("===================================\n");

      // Parse the full data first to get today's and upcoming events
      parseCalendarData(data);

      // Format and send tweet with today's and future events
      const tweetText = formatScheduleForTwitter(todayEvents, upcomingEvents);
      if (tweetText) {
        console.log("📱 Sending schedule tweet:", tweetText);
        await sendTweet(tweetText);
      }
    }

    // Update previous state with only the latest 14 days of data
    previousScheduleData = [...filteredCurrentData];

    // Parse the full data (not just 14 days) for the variables
    parseCalendarData(data);
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error fetching calendar data:`,
      error.message
    );

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    console.log("===================================\n");
  }
}

/**
 * Formats new events into a Twitter-friendly string
 */
function formatEventsForTwitter(events) {
  if (events.length === 0) return "";

  const header =
    events.length === 1
      ? "🚨 NEW WHITE HOUSE EVENT:"
      : `🚨 ${events.length} NEW WHITE HOUSE EVENTS:`;

  const eventStrings = events.map((event, index) => {
    const eventNum = events.length > 1 ? `${index + 1}. ` : "";
    const date = new Date(event.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = event.time_formatted || "Time TBA";
    const location =
      event.location === "The White House"
        ? "🏛️ White House"
        : `📍 ${event.location}`;

    // Truncate details if too long for Twitter
    let details = event.details;
    const maxDetailsLength =
      100 - eventNum.length - date.length - time.length - location.length - 10; // buffer for formatting
    if (details.length > maxDetailsLength) {
      details = details.substring(0, maxDetailsLength - 3) + "...";
    }

    return `${eventNum}📅 ${date} ${time}\n${location}\n${details}`;
  });

  let tweetText = `${header}\n\n${eventStrings.join("\n\n")}`;

  // Add hashtags if there's room
  const hashtags = "\n\n#WhiteHouse #Trump #Schedule";
  if (tweetText.length + hashtags.length <= 280) {
    tweetText += hashtags;
  }

  // Ensure we don't exceed Twitter's character limit
  if (tweetText.length > 280) {
    // If too long, truncate and add ellipsis
    tweetText = tweetText.substring(0, 277) + "...";
  }

  return tweetText;
}

/**
 * Formats today's and upcoming events into a Twitter-friendly schedule string
 */
function formatScheduleForTwitter(todayEvents, upcomingEvents) {
  const allEvents = [...todayEvents, ...upcomingEvents];

  if (allEvents.length === 0) return "";

  // Sort events by date and time
  allEvents.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });

  const today = new Date().toISOString().split("T")[0];
  let tweetText = "";

  // Group events by date
  const eventsByDate = {};
  allEvents.slice(0, 8).forEach((event) => {
    // Limit total events for space
    if (!eventsByDate[event.date]) {
      eventsByDate[event.date] = [];
    }
    eventsByDate[event.date].push(event);
  });

  // Format each date section
  const dateStrings = Object.keys(eventsByDate).map((date) => {
    const dateEvents = eventsByDate[date];
    const isToday = date === today;

    // Format date header
    const dateObj = new Date(date);
    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
    const monthDay = dateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    let dateHeader = isToday
      ? `🗓️ Today, ${monthDay}`
      : `🗓️ ${dayName}, ${monthDay}`;

    dateHeader = dateHeader.toUpperCase();

    // Format events for this date
    const eventStrings = dateEvents.map((event) => {
      let time = event.time_formatted ? `${event.time_formatted}` : "";
      time = time.toUpperCase();
      console.log("🚀 ~ formatScheduleForTwitter ~ time:", time);
      const location = `📍 ${event.location}`;

      // Handle different event types
      let details = event.details;
      if (details === "The President has no public events scheduled") {
        details = "The President has no public events scheduled";
      } else if (event.coverage && event.coverage !== "None") {
        details = `${details}`;
      }

      // Truncate if too long
      if (details.length > 60) {
        details = details.substring(0, 57) + "...";
      }
      let finalString = `${time}:   ${details}\n${location} 👥 ${event.coverage}`;

      if (details.includes("The President has no public events scheduled")) {
        finalString = "❌ The President has no public events scheduled";
      }

      return finalString;
    });

    return `${dateHeader}\n\n${eventStrings.join("\n\n")}`;
  });

  tweetText = dateStrings.join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");

  // Add more events indicator if needed
  if (allEvents.length > 8) {
    tweetText += `\n\n+ ${allEvents.length - 8} more events...`;
  }

  // Add hashtags if there's room
  const hashtags = "\n\n#WhiteHouse #Trump #Schedule";
  if (tweetText.length + hashtags.length <= 280) {
    tweetText += hashtags;
  }

  return tweetText;
}

/**
 * Filters events to only include those from the latest 14 days
 */
function filterToLatest14Days(events) {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoffDate = fourteenDaysAgo.toISOString().split("T")[0];

  return events.filter((event) => event.date >= cutoffDate);
}

/**
 * Detects new events by comparing current data with previous data
 */
function detectNewEvents(currentData) {
  if (isFirstFetch || previousScheduleData.length === 0) {
    return [];
  }

  // Create a Set of previous event identifiers for fast lookup
  const previousEventIds = new Set(
    previousScheduleData.map((event) => createEventId(event))
  );

  // Find events in current data that weren't in previous data
  const newEvents = currentData.filter((event) => {
    const eventId = createEventId(event);
    return !previousEventIds.has(eventId);
  });

  return newEvents;
}

/**
 * Creates a unique identifier for an event based on key properties
 */
function createEventId(event) {
  // Create a unique ID based on date, time, details, and location
  // This helps identify truly unique events
  return `${event.date}_${event.time || "no-time"}_${event.details}_${
    event.location
  }_${event.type}`;
}

/**
 * Parses the calendar data and extracts relevant information into variables
 */
function parseCalendarData(data) {
  // Store the complete data
  scheduleData = data;

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  // Extract the latest 10 events
  latestEvents = data.slice(0, 10);

  // Filter today's events
  todayEvents = data.filter((event) => event.date === today);

  // Filter upcoming events (future dates)
  upcomingEvents = data.filter((event) => event.date > today);

  // Silent parsing - no console output unless there are new events
}

/**
 * Starts the periodic fetching of calendar data
 */
function startPeriodicFetch() {
  console.log("Starting White House Calendar Tracker...");
  console.log("Fetching data every 30 seconds...\n");

  // Fetch immediately on start
  fetchCalendarData();

  // Set up interval to fetch every 30 seconds (30000 milliseconds)
  setInterval(fetchCalendarData, 15000);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down calendar tracker...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down calendar tracker...");
  process.exit(0);
});

// Create a simple HTTP server to keep Heroku dyno alive
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(
    `White House Calendar Tracker is running!\nTracking ${
      scheduleData.length
    } total events.\nLast updated: ${new Date().toISOString()}`
  );
});

server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

// Start the application
startPeriodicFetch();

// Export for potential module use
export {
  fetchCalendarData,
  parseCalendarData,
  detectNewEvents,
  createEventId,
  filterToLatest14Days,
  formatEventsForTwitter,
  formatScheduleForTwitter,
  scheduleData,
  latestEvents,
  todayEvents,
  upcomingEvents,
};
