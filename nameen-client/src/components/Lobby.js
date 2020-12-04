import React from "react";
import { useHistory } from "react-router-dom";
import { TextField, Button } from '@material-ui/core';
import './Lobby.css'

function Lobby(props) {

  const [gameID, setGameID] = React.useState("");
  const [playerName, setPlayerName] = React.useState("");
  const socket = props.socket;
  const history = useHistory();

  const handleGameChange = (event) => {
    setGameID(event.target.value);
  };

  const handleNameChange = (event) => {
    setPlayerName(event.target.value);
  };

  const handleClick = () => {
    if (playerName && gameID) {
      socket.emit('JOIN_GAME', {game: gameID, name: playerName});
      history.push(`/${gameID}/${playerName}`);
    }
  }

  return (
    <div className="Lobby">
      <form noValidate autoComplete="off" className='input-form' >
        <div className='input-form-row'>
          <TextField
            id="filled-basic"
            label="Name"
            color="primary"
            variant="outlined"
            onChange={handleNameChange}
          />
        </div>
        <div className='input-form-row'>
          <TextField
            id="filled-basic"
            label="Game ID"
            color="primary"
            variant="outlined"
            onChange={handleGameChange}
          />
          <Button variant="contained" size="large" color="primary" onClick={handleClick}>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Lobby;