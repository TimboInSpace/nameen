const express = require("express");
const session = require('express-session');
const port = 3001;
const app = express();

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: '*',
  }
});

const sessionMiddleware = session({
  secret: 'squirrel',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: null },
});
app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next);
});

let interval;
const timePerTurn = 60.0;
let timeRemaining = 60.0;

const wordList = ['Tom Cruise', 'Heptagon', 'Iggy Pop', 'Velcro', 'Boa Constrictor', 'Some sports thing', 'Brian Mulroney', 'Diffraction'];
let wordIndex = 0;

let games = {}; // An array of game 

io.on('connection', (socket) => {

  console.log(`Client connected: ${socket.id}`);
  const session = socket.request.session;
  session.connections++;
  session.save();

  // Start the timer if it isnt going already
  if (interval) {
    clearInterval(interval);
  }
  interval = setInterval(() => gameTimer(socket), 1000);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    clearInterval(interval);
  });

  socket.on('GOT_WORD', (gameID) => {
    // Double check that the socket is in the room
    console.log("Client got word, requesting another");
    socket.emit('NEXT_WORD', wordList[(wordIndex++)%wordList.length]);
  });

  socket.on('JOIN_GAME', (gameID, playerName) => {
    connectClientToGame(socket, gameID, playerName);
  });

});

const connectClientToGame = (socket, gameID, playerName) => {
  // Is the game already in the array?
  if (!games.hasOwnProperty(gameID)) {
    newGame = {
      status:'waiting', 
      teamA:[playerName], 
      teamB:[], 
      teamScores:[0,0]
    };
    games[gameID] = newGame;
    console.log(`Client starting new game: ${gameID}.`);
  } else { // Nope. Make a new entry
    // Game exists. Which team has fewer players?
    games[gameID].teamA.length > games[gameID].teamA.length ?
    games[gameID].teamB.push(playerName) :
    games[gameID].teamA.push(playerName) ;
    console.log(`Client joining existing game: ${gameID}.`);
  }
  socket.join(gameID);
  socket.to(gameID).emit('PLAYER_JOINED', games[gameID]);
};


const gameTimer = (socket) => {

  timeRemaining--;

  if (timeRemaining < 0)
    timeRemaining = timePerTurn;

  // Emitting a new message. Will be consumed by the client
  socket.emit("TICK", Math.floor(100 * timeRemaining / timePerTurn));
};

const index = require("./routes/index");
app.use(index);

server.listen(port, () => console.log(`Listening on port ${port}`));