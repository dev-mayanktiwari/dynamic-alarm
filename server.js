const express = require("express");
const app = express();

// Middleware to parse JSON
app.use(express.json());

// Sleep states
const SLEEP_STATES = {
  LIGHT: 0,
  DEEP: 1,
  REM: 2,
};

// Function to generate realistic sleep pattern
function generateSleepPattern(arraySize) {
  const pattern = [];

  // Ensure we have at least 5 light sleep periods at the end
  const lightSleepCount = Math.max(5, Math.floor(arraySize * 0.15)); // At least 15% light sleep
  const deepSleepCount = Math.floor(arraySize * 0.45); // ~45% deep sleep
  const remSleepCount = arraySize - lightSleepCount - deepSleepCount; // Remaining for REM

  // Create base pattern with more deep sleep in the beginning
  // and more REM/light sleep towards the end (realistic sleep cycle)

  // First half: More deep sleep
  const firstHalf = Math.floor(arraySize * 0.6);
  for (let i = 0; i < firstHalf; i++) {
    if (i < deepSleepCount * 0.7) {
      pattern.push(SLEEP_STATES.DEEP);
    } else {
      pattern.push(Math.random() < 0.6 ? SLEEP_STATES.DEEP : SLEEP_STATES.REM);
    }
  }

  // Second half: More REM and light sleep
  const remainingSlots = arraySize - firstHalf - lightSleepCount;
  for (let i = 0; i < remainingSlots; i++) {
    pattern.push(Math.random() < 0.7 ? SLEEP_STATES.REM : SLEEP_STATES.DEEP);
  }

  // Ensure last few elements are light sleep (wake-up preparation)
  for (let i = 0; i < lightSleepCount; i++) {
    pattern.push(SLEEP_STATES.LIGHT);
  }

  // Shuffle the middle portion while keeping the end light sleep intact
  const endLightSleep = pattern.slice(-lightSleepCount);
  const middlePortion = pattern.slice(0, -lightSleepCount);

  // Fisher-Yates shuffle for the middle portion
  for (let i = middlePortion.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middlePortion[i], middlePortion[j]] = [middlePortion[j], middlePortion[i]];
  }

  return [...middlePortion, ...endLightSleep];
}

// Function to generate random target time between soft and hard limits
function generateTargetTime(softLimit, hardLimit) {
  const softTime = new Date(softLimit);
  const hardTime = new Date(hardLimit);

  const timeDiff = hardTime.getTime() - softTime.getTime();
  const randomOffset = Math.floor(Math.random() * timeDiff);

  const targetTime = new Date(softTime.getTime() + randomOffset);
  return targetTime;
}

// POST endpoint for alarm
app.post("/alarm", (req, res) => {
  try {
    const { soft, hard } = req.body;

    // Validate input
    if (!soft || !hard) {
      return res.status(400).json({
        error: "Both soft and hard limit times are required",
        example: {
          soft: "2024-01-15T06:00:00.000Z",
          hard: "2024-01-15T06:05:00.000Z",
        },
      });
    }

    // Parse dates
    const softLimit = new Date(soft);
    const hardLimit = new Date(hard);

    // Validate dates
    if (isNaN(softLimit.getTime()) || isNaN(hardLimit.getTime())) {
      return res.status(400).json({
        error:
          "Invalid date format. Use ISO 8601 format (e.g., 2024-01-15T06:00:00.000Z)",
      });
    }

    if (softLimit >= hardLimit) {
      return res.status(400).json({
        error: "Soft limit must be before hard limit",
      });
    }

    // Generate target time
    const target = generateTargetTime(soft, hard);

    // Calculate time difference in seconds
    const timeDiffMs = target.getTime() - softLimit.getTime();
    const timeDiffSeconds = Math.floor(timeDiffMs / 1000);

    // Calculate array size (time gap divided by 2)
    const arraySize = Math.floor(timeDiffSeconds / 2);

    if (arraySize <= 0) {
      return res.status(400).json({
        error: "Time difference too small to generate meaningful data",
      });
    }

    // Generate sleep pattern
    const data = generateSleepPattern(arraySize);

    // Helper function to convert UTC to IST
    const convertToIST = (utcDate) => {
      const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
      const istDate = new Date(utcDate.getTime() + istOffset);
      return istDate.toISOString().replace("Z", "+05:30");
    };

    // Response
    const response = {
      target: {
        utc: target.toISOString(),
        ist: convertToIST(target),
      },
      data: data,
      metadata: {
        softLimit: {
          utc: softLimit.toISOString(),
          ist: convertToIST(softLimit),
        },
        hardLimit: {
          utc: hardLimit.toISOString(),
          ist: convertToIST(hardLimit),
        },
        timeDifferenceSeconds: timeDiffSeconds,
        arraySize: arraySize,
        sleepStates: {
          0: "Light Sleep",
          1: "Deep Sleep",
          2: "REM Sleep",
        },
        patternSummary: {
          lightSleep: data.filter((x) => x === 0).length,
          deepSleep: data.filter((x) => x === 1).length,
          remSleep: data.filter((x) => x === 2).length,
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error processing alarm request:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  const now = new Date();
  const convertToIST = (utcDate) => {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utcDate.getTime() + istOffset);
    return istDate.toISOString().replace("Z", "+05:30");
  };

  res.json({
    status: "OK",
    message: "Dynamic Alarm System is running",
    timestamp: {
      utc: now.toISOString(),
      ist: convertToIST(now),
    },
  });
});

// Root endpoint with usage instructions
app.get("/", (req, res) => {
  res.json({
    message: "Dynamic Alarm System API",
    endpoints: {
      "POST /alarm": {
        description: "Generate dynamic alarm based on sleep patterns",
        payload: {
          soft: "ISO 8601 date string (soft limit)",
          hard: "ISO 8601 date string (hard limit)",
        },
        example: {
          soft: "2024-01-15T06:00:00.000Z",
          hard: "2024-01-15T06:05:00.000Z",
        },
      },
      "GET /health": "Health check endpoint",
    },
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Dynamic Alarm System server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API Documentation: http://localhost:${PORT}/`);
});

module.exports = app;
