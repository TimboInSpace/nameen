const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const port = 3001;
const index = require("./routes/index");

const app = express();
app.use(index);

const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: '*',
  }
});

let interval;
const timePerTurn = 60.0;
let timeRemaining = 60.0;

const wordList = ['Tom Cruise', 'Heptagon', 'Iggy Pop', 'Velco', 'Boa Constrictor', 'Some sports thing', 'Brian Mulroney', 'Diffraction'];
let wordIndex = 0;

io.on('connection', (socket) => {

  console.log("New client connected");

  // Don't set a separate interval for each client
  if (interval) {
    clearInterval(interval);
  }
  interval = setInterval(() => gameTimer(socket), 1000);

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });

  socket.on('GOT_WORD', () => {
    console.log("Client got word, requesting another");
    socket.emit('NEXT_WORD', wordList[(wordIndex++)%wordList.length]);
  });

});

const gameTimer = (socket) => {

  timeRemaining--;

  if (timeRemaining < 0)
    timeRemaining = timePerTurn;

  // Emitting a new message. Will be consumed by the client
  socket.emit("TICK", Math.floor(100 * timeRemaining / timePerTurn));
};

server.listen(port, () => console.log(`Listening on port ${port}`));