import logo from '../logo.svg';
import './GameRoom.css';
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, LinearProgress } from '@material-ui/core'

function GameRoom(props) {

  const [displayPhrase, setDisplayPhrase] = useState('[original client value]');
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [gameState, setGameState] = useState({ teamA: [], teamB: [], teamScores:[0,0], status:'waiting'});
  const [myID, setMyID] = useState("");
  const [roundResults, setRoundResults] = useState({
    start : [],
    scored: [],
    penalty: [],
    final: []
  });
  const [countdownTime, setCountdownTime] = useState(3);
  // This caused a hell of a lot of trouble: 
  const countdownRef = useRef(countdownTime);
  countdownRef.current = countdownTime;
  let params = useParams();
  let socket = props.socket;
  let countdownTimer = null;
  const gameID = params.gameID;
  const playerName = params.playerName;

  useEffect(() => {

    socket.on("I_DUB_THEE", (data) => {
      if (myID === "") { // single-shot 
        setMyID(data);
      }
    });

    socket.on("NEXT_WORD", (data) => {
      setDisplayPhrase(data);
    });

    socket.on("TICK", data => {
      setTimeRemaining(data);
    });

    socket.on("NEXT_PLAYER", (gameState) => {
      setGameState(gameState);
    });

    socket.on('PLAYERS_CHANGED', (gameState) => {
      setGameState(gameState);
    });

    socket.on('SCORES_CHANGED', (gameState) => {
      setGameState(gameState);
    });

    socket.on('ROUND_START', (gameState) => {
      setGameState(gameState);
      handleCountdownTimer();
    });

    socket.on('ROUND_OVER', (resultsObj) => {
      setRoundResults(resultsObj);
    });

    socket.on('GAME_OVER', (redirect) => {
      // Redirect back to the lobby
      window.location.href = redirect;
    });

    return () => {
      if (countdownTimer)
        clearTimeout(countdownTimer);
    }

  }, [socket, myID]);

  function handleCountdownTimer() {
    if (countdownTime.current > 0) {
      console.log(`decrementing the counter...${countdownTime.current}`);
      setCountdownTime(countdownTime.current - 1);
      countdownTimer = setTimeout( () => {
        handleCountdownTimer()
      }, 1000);
    }
  }

  function handleNextClick() {
    console.log('NEXT button was clicked');
    socket.emit('GOT_WORD', { gameID });
  }

  function handlePassClick() {
    console.log('PASS button was clicked');
    socket.emit('PASS_WORD', { gameID });
  }

  function listPlayers() {
    if (gameState.hasOwnProperty('players') && gameState.hasOwnProperty('activePlayer')) {
      return (
        <div><ul>{
              gameState.players.map((player) => {
                return(
                  gameState.activePlayer === player.id ?
                  <li><b>{player.name}</b></li> :
                  <li>{player.name}</li> 
                );
              })
        }</ul></div>
      );
    }
  }

  if (gameState.status === 'waiting') {
    return (
      <p> Waiting for players... </p>
    );
  } else if (gameState.status === 'countdown') {
    return (
    <p>{countdownTime}</p>
    );
  } else if (gameState.status === 'results') {
    return (
      <table>
        <tbody>
          <tr>
            <th></th><th>Team A</th><th>Team B</th>
          </tr>
          <tr>
            <th>Start:</th><td>{roundResults.start[0]}</td><td>{roundResults.start[1]}</td>
          </tr>
          <tr>
            <th>Scored:</th><td>{roundResults.scored[0]}</td><td>{roundResults.scored[1]}</td>
          </tr>
          <tr>
            <th>Penalty:</th><td>{roundResults.penalty[0]}</td><td>{roundResults.penalty[1]}</td>
          </tr>
          <tr>
            <th>Final:</th><td>{roundResults.final[0]}</td><td>{roundResults.final[1]}</td>
          </tr>
        </tbody>
      </table>
    );
  } else {
    return (
      <>
        {
          listPlayers()
        }
        <p>
        {gameState.teamScores[0]} | {gameState.teamScores[1]}
        </p>
        <h3>Game ID: {gameID}</h3>
        <img src={logo} className="App-logo" alt="logo" />
        {gameState.activePlayer === myID ?
        <p>"{displayPhrase}"</p> : <p>...</p>}
        <span>
          <Button variant="outlined" size="large" color="primary" onClick={handlePassClick}
                  disabled={ gameState.activePlayer !== myID }>
            PASS
          </Button>
          <Button variant="contained" size="large" color="primary" onClick={handleNextClick}
                  disabled={ gameState.activePlayer !== myID }>
            GOT IT
          </Button>
          <div style={{ marginTop: '20px' }}>
            <LinearProgress variant="determinate" color="primary" value={timeRemaining} />
          </div>
        </span>
      </>
    );
  }
}

export default GameRoom;
