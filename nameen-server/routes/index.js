const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).send("<p>You've reached the backend, over http!</p>");
});

module.exports = router;
