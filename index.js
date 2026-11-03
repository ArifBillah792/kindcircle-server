import "dotenv/config";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

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

// Test the connection once when the server starts
client
  .db("admin")
  .command({ ping: 1 })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection failed:", err.message));

// One user can join an event only once
joinsCollection
  .createIndexes([{ key: { eventId: 1, userEmail: 1 }, unique: true }])
  .catch((err) => console.error("Index error:", err.message));

const EVENT_TYPES = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Education",
  "Health Camp",
  "Food Drive",
];

// Shared validation for create and update. Returns an error message, or null if valid.
function validateEvent({
  title,
  description,
  eventType,
  thumbnail,
  location,
  eventDate,
}) {
  if (
    !title ||
    !description ||
    !eventType ||
    !thumbnail ||
    !location ||
    !eventDate
  ) {
    return "All fields are required";
  }
  if (!EVENT_TYPES.includes(eventType)) {
    return "Invalid event type";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return "Date must be in YYYY-MM-DD format";
  }
  const today = new Date().toISOString().slice(0, 10);
  if (eventDate <= today) {
    return "Event date must be in the future";
  }
  return null;
}

app.get("/", (req, res) => {
  res.send("KindCircle server is running");
});

// Create an event
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

  if (!creatorEmail) {
    return res.status(400).send({ message: "Creator email is required" });
  }

  const error = validateEvent(req.body);
  if (error) {
    return res.status(400).send({ message: error });
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

// Get all upcoming events (today or later), soonest first
app.get("/events", async (req, res) => {
  const today = new Date(new Date().toISOString().slice(0, 10));

  const events = await eventsCollection
    .find({ eventDate: { $gte: today } })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(events);
});

// Get 6 nearest upcoming events (home page)
app.get("/events/recent", async (req, res) => {
  const today = new Date(new Date().toISOString().slice(0, 10));

  const events = await eventsCollection
    .find({ eventDate: { $gte: today } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();

  res.send(events);
});

// Get a single event by id (public)
app.get("/events/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });

  if (!event) {
    return res.status(404).send({ message: "Event not found" });
  }

  res.send(event);
});

// Get events created by a user (Manage Events page)
// TEMPORARY: email comes from the query string. Later it will come from the JWT.
app.get("/my-events", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const events = await eventsCollection
    .find({ creatorEmail: email })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(events);
});

// Update an event (only by its creator)
// TEMPORARY: email comes from the body. Later it will come from the JWT.
app.patch("/events/:id", async (req, res) => {
  const { id } = req.params;
  const {
    email,
    title,
    description,
    eventType,
    thumbnail,
    location,
    eventDate,
  } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  const error = validateEvent(req.body);
  if (error) {
    return res.status(400).send({ message: error });
  }

  // Ownership check
  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ message: "Event not found" });
  }
  if (event.creatorEmail !== email) {
    return res
      .status(403)
      .send({ message: "You can only update your own events" });
  }

  const result = await eventsCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        title: title.trim(),
        description: description.trim(),
        eventType,
        thumbnail: thumbnail.trim(),
        location: location.trim(),
        eventDate: new Date(eventDate),
      },
    },
  );

  res.send(result);
});

// Delete an event (only by its creator)
// TEMPORARY: email comes from the query string. Later it will come from the JWT.
app.delete("/events/:id", async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  // Ownership check
  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ message: "Event not found" });
  }
  if (event.creatorEmail !== email) {
    return res
      .status(403)
      .send({ message: "You can only delete your own events" });
  }

  const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });

  // Clean up everyone's join records for this event
  await joinsCollection.deleteMany({ eventId: id });

  res.send(result);
});

// Join an event
// TEMPORARY: user info comes from the body. Later the email will come from the JWT.
app.post("/events/:id/join", async (req, res) => {
  const { id } = req.params;
  const { userEmail, userName, userPhoto } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }
  if (!userEmail) {
    return res.status(400).send({ message: "User email is required" });
  }

  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
  if (!event) {
    return res.status(404).send({ message: "Event not found" });
  }

  // Can't join an event that has already passed
  const today = new Date(new Date().toISOString().slice(0, 10));
  if (event.eventDate < today) {
    return res.status(400).send({ message: "This event has already ended" });
  }

  // Already joined?
  const alreadyJoined = await joinsCollection.findOne({
    eventId: id,
    userEmail,
  });
  if (alreadyJoined) {
    return res
      .status(409)
      .send({ message: "You have already joined this event" });
  }

  // Store event data + user data together
  const joinRecord = {
    eventId: id,
    eventTitle: event.title,
    eventType: event.eventType,
    eventLocation: event.location,
    eventThumbnail: event.thumbnail,
    eventDate: event.eventDate,
    userEmail,
    userName: userName || "",
    userPhoto: userPhoto || "",
    joinedAt: new Date(),
  };

  const result = await joinsCollection.insertOne(joinRecord);

  // Increase the event's participant count by 1
  await eventsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $inc: { participantCount: 1 } },
  );

  res.status(201).send(result);
});

app.get("/joined-events", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const joined = await joinsCollection
    .find({ userEmail: email })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(joined);
});

app.get("/events/:id/join-status", async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const record = await joinsCollection.findOne({
    eventId: id,
    userEmail: email,
  });
  res.send({ joined: !!record });
});

app.listen(port, () => {
  console.log(`KindCircle server running on port ${port}`);
});
