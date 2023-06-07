const express = require("express");
const app = express();
const superagent = require("superagent");

// In-memory cache
const cache = {};

// Helper methods for cache
function getCache(key) {
  const item = cache[key];
  if (item && item.expires > Date.now()) {
    return item.data;
  }
  delete cache[key];
  return null;
}

function setCache(key, data, ttl) {
  cache[key] = {
    data,
    expires: Date.now() + ttl,
  };
}

function getCacheSize() {
  let size = 0;
  for (const key in cache) {
    if (cache.hasOwnProperty(key)) {
      size += key.length + JSON.stringify(cache[key]).length;
    }
  }
  return size;
}

// Warmup function
async function warmup() {
  const warmupTime = Math.floor(Math.random() * (240000 - 120000 + 1) + 120000); // Randomize warmup time between 2-4 minutes
  console.log(`Starting warmup for ${warmupTime / 1000} seconds...`);

  // Make requests to Star Wars API and store in cache
  const cacheSizeLimit = 400000000;
  const delayRange = [1000, 5000]; // Randomize delay between 1-5 seconds
  let cacheSize = 0;
  let requestCount = 0;

  async function populateCache() {
    const chunkSize = 100000000; // Increase chunk size to 100 MB
    let chunkCacheSize = 0;
    let chunkRequestCount = 0;

    while (chunkCacheSize < chunkSize && chunkRequestCount < 10) {
      const delay = Math.floor(
        Math.random() * (delayRange[1] - delayRange[0] + 1) + delayRange[0]
      );
      try {
        const response = await superagent.get("https://swapi.dev/api/films/1/");
        const data = response.body;
        const dataSize = JSON.stringify(data).length;
        if (chunkCacheSize + dataSize >= chunkSize) {
          console.log(
            `Chunk size limit reached. Skipping request ${
              chunkRequestCount + 1
            }.`
          );
          break;
        }

        setCache(`swapi-${requestCount + chunkRequestCount}`, data, delay);
        chunkCacheSize += dataSize;
        requestCount++;
      } catch (err) {
        console.error(err);
      }
    }

    cacheSize += chunkCacheSize;
    requestCount += chunkRequestCount;

    if (cacheSize < cacheSizeLimit) {
      await populateCache();
    }
  }

  Array.from({ length: 20 }, () => populateCache());

  await new Promise((resolve) => setTimeout(resolve, warmupTime));

  console.log("Warmup complete.");
  app.listen(3000, () => {
    console.log("Server listening on port 3000.");
  });
}

// Healthcheck function
function healthcheck(_, res) {
  res.status(200).send("Healthy");
}

function getProduct() {
  const keys = Object.keys(cache);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  const data = getCache(randomKey);
  return data;
}
// Routes
app.get("/api/products", (_, res) => {
  const data = getProduct();
  if (data) {
    res.send(data);
  } else {
    res.send("Cache is empty.");
  }
});

app.get("/view/healthcheck", healthcheck);

app.get("/isAlive", healthcheck);

app.get("*", async (_, res) => {
  try {
    const cacheSizeInMB = getCacheSize() / 1000000;

    const html = `
      <html>
        <head>
          <title>Cache Size</title>
        </head>
        <body>
          <h1>Cache Size</h1>
          <p>The current cache size is ${cacheSizeInMB.toFixed(2)} MB.</p>
          <h2>Response Body</h2>
          <pre>${JSON.stringify(Object.keys(cache))}</pre>
        </body>
      </html>
    `;
    res.send(html);
  } catch {
    res.status(500).send("Internal Server Error");
  }
});

// Start warmup
warmup();
