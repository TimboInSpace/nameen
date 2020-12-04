import './App.css';
import React from 'react';
import { Switch, Route, BrowserRouter as Router} from 'react-router-dom';
import Lobby from "./components/Lobby";
import GameRoom from "./components/GameRoom";
import io from 'socket.io-client';

const BACKEND = 'http://127.0.0.1:3001';

function App() {

  const mySock = io(BACKEND);

  return (
    <div className="App">
      <header className="App-header">
        <Router>
          <Switch>
            <Route path='/:gameID/:playerName' render={() => <GameRoom socket={mySock} />} />
            <Route path='/'  render={() => <Lobby socket={mySock} />} />
          </Switch>
        </Router>
      </header>
    </div>
  );
}

export default App;
