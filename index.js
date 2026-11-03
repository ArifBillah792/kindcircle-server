import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("KindCircle server is running");
});

app.listen(port, () => {
  console.log(`KindCircle server running on port ${port}`);
});
