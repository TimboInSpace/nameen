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

const ROUND_TIME = 60.0;
const COUNTDOWN_TIME = 3.0;
const MIN_PLAYERS = 4;
const SCORE_THRESH = 100;

const wordList = ['Tom Cruise', 'Heptagon', 'Iggy Pop', 'Velcro', 'Boa Constrictor', 'Some sports thing', 'Brian Mulroney', 'Diffraction'];
let wordIndex = 0;

let games = {}; // An array of game
let mySocks = {};
let myTimers = {};

io.on('connection', (socket) => {

  console.log(`Client connected: ${socket.id}`);
  const session = socket.request.session;
  session.connections++;
  session.save();

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Remove player from game
    disconnectClientFromGame(session.game, session.id);
    // If they were the last person in the game, also delete the game
    if (games.hasOwnProperty(session.game)
     && games[session.game].players.length === 0) {
       closeGame(session.game);
    }
  });

  socket.on('GOT_WORD', (args) => {
    if (args.gameID) {
      //console.log("Client ("+ session.username +", in gameID:"+ args.gameID +") got word, requesting another");
      scorePoint(args.gameID);
      io.to(args.gameID).emit('SCORES_CHANGED', games[args.gameID]);
      sendNextWord(args.gameID);
    }
  });

  socket.on('PASS_WORD', (args) => {
    if (args.gameID) {
      //console.log("Client ("+ session.username +", in gameID:"+ args.gameID +") passed play.");
      activateNextPlayer(args.gameID);
      if (games[args.gameID].hasOwnProperty('activePlayer')) {
        io.to(args.gameID).emit('NEXT_PLAYER', games[args.gameID]);
      }
      sendNextWord(args.gameID);
    }
  });

  socket.on('JOIN_GAME', (args) => {
    //console.log('Setting username: '+args.name);
    session.username = args.name;
    session.game = args.game;
    //console.log('....Username set to '+session.username);
    connectClientToGame(socket, session, args.game, args.name);
    // Check if the game has MIN_PLAYERS and is still waiting. If so, begin a round.
    if (readyToStart(args.game)) {
      beginGame(args.game);
    }
  });

});

// Put a player in a game. Associate their socket to their name
const connectClientToGame = (socket, session,  gameID, playerName) => {
  // Is the game already in the array?
  if (!games.hasOwnProperty(gameID)) {
    games[gameID] = defaultGame(session, gameID, playerName);
    console.log(`Client starting new game. (GameID: ${gameID})`);
  } else { 
    // Game exists. Which team has fewer players?
    games[gameID].teamA.length > games[gameID].teamB.length ?
    games[gameID].teamB.push(session.id) :
    games[gameID].teamA.push(session.id) ;
    games[gameID].players.push({
      id: session.id,
      name: ensureUnique(games[gameID].players, playerName)
    });
    console.log(`Client joining existing game (GameID: ${gameID})`);
  }
  mySocks[session.id] = socket.id;
  socket.emit('I_DUB_THEE',session.id);
  socket.join(gameID);
  io.to(gameID).emit('PLAYERS_CHANGED', games[gameID]);
};

// Remove a player from a game. Delete their socket reference
const disconnectClientFromGame = (gameID, playerID) => {
  if (games.hasOwnProperty(gameID)) {
    let g = games[gameID];
    let i = findPlayer(g.players,playerID);
    if (g.activePlayer === playerID) {
      if (g.players.length > 0) {
        g.activePlayer = getNextPlayer(g.players, i);
      }
    }
    if (i >= 0) {
      g.players = g.players.splice(i,1);
      g.teamA = g.teamA.filter( pID => (pID != playerID));
      g.teamB = g.teamB.filter( pID => (pID != playerID));
    }
    io.to(gameID).emit('PLAYERS_CHANGED', games[gameID]);
  }
  // Delete the socket reference too
  if (mySocks.hasOwnProperty(playerID)) {
    delete mySocks[playerID];
  }
};

// Send the next word to the active player of a certain game
const sendNextWord = (gameID) => {
  if (games.hasOwnProperty(gameID)) {
    let g = games[gameID];
    // Look up the socket ID
    if (mySocks.hasOwnProperty(g.activePlayer)) {
      let sockID = mySocks[g.activePlayer];
      io.to(sockID).emit('NEXT_WORD', wordList[(wordIndex++)%wordList.length]);
    }
  }
}

// Return a default game with one player in it
const defaultGame = (session, gameID, playerName) => {
  // Statuses:
  // waiting, teamA, teamB, results 
  return ({
    id: gameID,
    status: 'waiting',
    activePlayer: session.id,
    players: [
      { id:session.id, name:playerName }
    ],
    teamA: [session.id],
    teamB: [],
    teamScores: [0, 0]
  });
};

// Return true if the game is done waiting for players and ready to begin
const readyToStart = (gameID) => {
  if (games.hasOwnProperty(gameID)) {
    let g = games[gameID];
    if (g.hasOwnProperty('status')
     && g.status === 'waiting'
     && g.hasOwnProperty('players')
     && g.players.length >= MIN_PLAYERS) {
       return true;
     }
  }
  return false;
}

// Begin a game
const beginGame = (gameID) => {
  beginRound(gameID);
};

// Start a round. kick off the timer
const beginRound = (gameID) => {

  console.log(`Beginning round for game: ${gameID}`);

  // Only begin games that are in the waiting status
  if (games.hasOwnProperty(gameID)
    && games[gameID].hasOwnProperty('status')
    && ( games[gameID].status === 'waiting' 
      || games[gameID].status === 'results')) {

    games[gameID].roundStartScores = games[gameID].teamScores;
    // Start the timer. 
    if (myTimers[gameID]) {
      clearInterval(myTimers[gameID]);
    }
    games[gameID].timeRemaining = ROUND_TIME + COUNTDOWN_TIME;
    myTimers[gameID] = setInterval(() => roundTimer(gameID), 1000);

    // Activate next player
    games[gameID].activePlayer = games[gameID].players[0].id;
    games[gameID].status = 'countdown';
    io.to(gameID).emit("ROUND_START", games[gameID]);
    // and in 3s send the word.
    setTimeout(() => {
      activateNextPlayer(gameID);
      sendNextWord(gameID);
      io.to(gameID).emit('SCORES_CHANGED', games[gameID]);
    }, 3000);
  }
};

// Close the game, end all its timers and delete the object
const closeGame = (gameID) => {
  if (myTimers.hasOwnProperty(gameID)) {
    clearInterval(myTimers[gameID]);
  }
  delete games[gameID];
};

// 1s tick timer, enabled during a round.
const roundTimer = (gameID) => {
  // decrement the round time. 
  games[gameID].timeRemaining--;

  if (games[gameID].timeRemaining <= 0) {
    //  If so, round time is up. Otherwise keep ticking
    timesUp(gameID);
  } else {
    io.to(gameID).emit(
      "TICK", Math.floor(100 * games[gameID].timeRemaining / ROUND_TIME)
    );
  }
};

// Score one point for the active player's team.
const scorePoint = (gameID) => {
  if (games.hasOwnProperty(gameID) && games[gameID].hasOwnProperty('activePlayer')) {
    // find the index of the current player in the players array
    let g = games[gameID];
    if (g.hasOwnProperty('players')) {
      let i = teamIndex(
        g.teamA,
        g.teamB,
        g.activePlayer
      );
      g.teamScores[i]++;
    }
  }
};

// Transfer play to the next player on the next team.
// Game status will be either teamA or teamB after this function
const activateNextPlayer = (gameID) => {

  if (games.hasOwnProperty(gameID) 
    && games[gameID].hasOwnProperty('activePlayer')
    && games[gameID].hasOwnProperty('players')
    && games[gameID].hasOwnProperty('status')) {

    // Find the current player
    let currPlayer = games[gameID].activePlayer; // sessionID of current player
    let p = games[gameID].players;

    // Set the active player to the next in the sequence
    games[gameID].activePlayer = getNextPlayer(p,findPlayer(p,currPlayer)).id;

    // Change the game state to activate the other team
    let team = teamIndex(games[gameID].teamA, games[gameID].teamB, games[gameID].activePlayer);
    if (team < 0) {
      console.log('Player not found in game when attempting to select next team!?');
      return;
    }
    if (team) {
      // activate team A
      games[gameID].status = 'teamA';
    } else {
      // activate team B
      games[gameID].status = 'teamB';
    }
  } else { 
    console.log('game state is missing props.');
  }
};

// Timer ran out. Penalize the active player's team.
const timesUp = (gameID) => {
  // Find the active player
  // TODO: Change the game state to results
  // emit('ROUND_OVER', roundResults(gameID))
  if (games.hasOwnProperty(gameID)) {
    if (games[gameID].hasOwnProperty('activePlayer') && games[gameID].hasOwnProperty('players')) {
      games[gameID].status = 'results';
      io.to(gameID).emit('ROUND_OVER', roundResults(gameID));
      io.to(gameID).emit('SCORES_CHANGED', games[gameID]);
      setTimeout(() => {
        // If the scores are still less than the threshold, keep re-triggering new rounds
        if (Math.max(...games[gameID].teamScores) < SCORE_THRESH) {
          beginRound(gameID);
        } else {
          io.to(gameID).emit('GAME_OVER', "/");
        }
      }, 10000);
    }
  }
  // Clear the timer
  if (games[gameID].timer) {
    clearInterval(games[gameID].timer);
  }
};

// Return an object that holds the scores / penalties of the round
const roundResults = (gameID) => {
  if (games[gameID].hasOwnProperty('roundStartScores')) {

    let currPlayer = games[gameID].activePlayer; // sessionID of current player

    let i = teamIndex(
      games[gameID].teamA,
      games[gameID].teamB,
      games[gameID].activePlayer
    );

    let scored = games[gameID].teamScores.map( (curScore, i) => {
      return curScore - games[gameID].roundStartScores[i]; 
    });

    penalty = [0,0];
    penalty[i] = Math.floor(0.5*(scored[i]));

    games[gameID].teamScores = games[gameID].teamScores.map( (curScore, i) => {
      return curScore - penalty[i]; 
    });

    return( {
      start : games[gameID].roundStartScores,
      scored: scored,
      penalty: penalty,
      final: games[gameID].teamScores
    });
  }
}

// Return the index of the player in the players array
const findPlayer = (playersArr, findID) => {
  for (let i = 0; i < playersArr.length; i++) {
    if (playersArr[i].hasOwnProperty('id') 
      && playersArr[i].id === findID) {
        return i;
      }
  }
  return -1;
};

// Returns the {id, name} object of the next player
const getNextPlayer = (playersArr, currentPlayerIndex) => {
  if (playersArr.length === 0) return null;

  let nextPlayerIndex = (currentPlayerIndex + 1) % playersArr.length;
  return playersArr[nextPlayerIndex];
}

// Returns 0 if the player is on teamA, 1 for teamB, or -1 for not found.
const teamIndex = (arrTeamA, arrTeamB, playerID) => {
  let i;
  for (i = 0; i < arrTeamA.length; i++) {
    if (arrTeamA[i] === playerID) {
        return 0;
    }
  }
  for (i = 0; i < arrTeamB.length; i++) {
    if (arrTeamB[i] === playerID) {
      return 1;
    }
  }
  return -1;
}; 

// Add a numeric suffix to the player's desired name until the username
// is unique within the players array
const ensureUnique = (playersArr, requestedName) => {
  
  const isUniqueName = (playersArr, nom) => {
    for (let i = 0; i < playersArr.length; i++) {
      if (playersArr[i].name === nom)
        return false;
    }
    return true;
  }

  if (isUniqueName(playersArr, requestedName)) return requestedName;
  
  let j = 0;
  while (!isUniqueName(playersArr, requestedName + j)) {
    j++;
  }
  return (requestedName + j);
};

const index = require("./routes/index");
app.use(index);

server.listen(port, () => console.log(`Listening on port ${port}`));