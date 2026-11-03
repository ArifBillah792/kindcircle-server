import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db(process.env.DB_NAME);
const eventsCollection = db.collection("events");
const joinsCollection = db.collection("joins");

client
  .db("admin")
  .command({ ping: 1 })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection failed:", err.message));

const EVENT_TYPES = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Education",
  "Health Camp",
  "Food Drive",
];

app.get("/", (req, res) => {
  res.send("KindCircle server is running");
});

app.post("/events", async (req, res) => {
  const {
    title,
    description,
    eventType,
    thumbnail,
    location,
    eventDate,
    creatorEmail,
    creatorName,
    creatorPhoto,
  } = req.body;

  if (
    !title ||
    !description ||
    !eventType ||
    !thumbnail ||
    !location ||
    !eventDate ||
    !creatorEmail
  ) {
    return res.status(400).send({ message: "All fields are required" });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return res
      .status(400)
      .send({ message: "Date must be in YYYY-MM-DD format" });
  }

  if (!EVENT_TYPES.includes(eventType)) {
    return res.status(400).send({ message: "Invalid event type" });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (eventDate <= today) {
    return res
      .status(400)
      .send({ message: "Event date must be in the future" });
  }

  const newEvent = {
    title: title.trim(),
    description: description.trim(),
    eventType,
    thumbnail: thumbnail.trim(),
    location: location.trim(),
    eventDate: new Date(eventDate),
    creatorEmail,
    creatorName: creatorName || "",
    creatorPhoto: creatorPhoto || "",
    participantCount: 0,
    createdAt: new Date(),
  };

  const result = await eventsCollection.insertOne(newEvent);
  res.status(201).send(result);
});

app.get("/events", async (req, res) => {
  const today = new Date(new Date().toISOString().slice(0, 10));

  const events = await eventsCollection
    .find({ eventDate: { $gte: today } })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(events);
});

app.listen(port, () => {
  console.log(`KindCircle server running on port ${port}`);
});
