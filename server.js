const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const crypto = require('crypto');
const app = express();
// our localhost port
const port = process.env.PORT || 3000;
//const port = 3001;
// our server instance
const server = http.createServer(app);
// This creates our socket using the instance of the server
const io = socketIO();
app.use(express.static(path.join(__dirname, "prod/build")));
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "prod/build", "index.html"));
});
server.listen(port, () => console.log(`Listening on port ${port}`));
io.listen(server);
//////////////////////////////////////////////

var matches = [];

const mountGrid = match => {
  let h = Math.min(match.player1.cohordinates[1], match.player2.cohordinates[1]);
  let w = Math.min(match.player1.cohordinates[0], match.player2.cohordinates[0]);
  //get number of cells
  w = Math.floor((w - 20) / 32);
  h = Math.floor((h - 60) / 32);
  //if with and height are even get the closest odd

  w = w % 2 ? w : w - 1;
  h = h % 2 ? h : h - 1;
  const centerVIndex = Math.floor(h / 2);
  const centerHIndex = Math.floor(w / 2);
  let grid = [];
  for (let i = 0; i < h; i++) grid.push(new Array(w).fill("empty"));
  let otherPlayer = match.actualPlayer === "◯" ? "╳" : "◯";
  grid[centerVIndex].splice(centerHIndex, 1, otherPlayer);
  return grid;
};
io.on("connection", socket => {
  console.log("User connected ", socket.id);
  socket.on("user reconnected", roomName => {
    socket.roomName=roomName;
    socket.join(roomName);
    io.to(socket.roomName).emit("connection recovered");
  });

  socket.on("register player", (cohordinates, roomName,symbol) => {
    const newRoomName =roomName || crypto.randomBytes(2).toString('hex');
    socket.roomName=newRoomName;
    socket.join(newRoomName)
    //se non viene passato un roomName vuol dire che e una nuova partita: in questo caso va registrato il player numero1
    if(!roomName){
      let match={
        actualPlayer:symbol,
        roomName:newRoomName,
        player1:{
          cohordinates,
          symbol,
          socket
        }
      }
      matches.push(match);
      console.log(`Player 1 registered. New room Name: ${socket.roomName}`);
      io.to(newRoomName).emit("set my player", newRoomName);
    }else{
      let match=matches.find(match=>match.roomName===roomName);
      if(match){
        match.player2={
          cohordinates,
          symbol,
          socket
        }
        let state = {
          grid: mountGrid(match),
          matchStatus: "new game",
          actualPlayer:match.actualPlayer,
          roomName:newRoomName
        };
        console.log(`Player 2 registered. Room Name: ${socket.roomName}`);
        io.to(newRoomName).emit("update", state);
      }
    }
  });

  socket.on("moved", (state,vIndex, hIndex) => {
    let match=matches.find(match=>match.roomName===state.roomName);
    match.actualPlayer = match.actualPlayer === "◯" ? "╳" : "◯";
    state.actualPlayer = match.actualPlayer;
    console.log(`Update room n° ${socket.roomName}`)
    io.to(state.roomName).emit("update", state,vIndex, hIndex);
  });

  socket.on("won", state => {
    state.matchStatus = "lost";
    state.grid = state.grid.map(row => {
      return row.map(cell => {
        return cell === "win" ? "lost" : cell;
      });
    });
    io.to(state.roomName).emit("update", state);
  });

  socket.on("new game", state => {
    console.log(`New game in room n° ${socket.roomName}`)
    let match=matches.find(match=>match.roomName===state.roomName);
    match.actualPlayer = state.myPlayer === "◯" ? "╳" : "◯";
    state.actualPlayer = match.actualPlayer;
    state.grid = mountGrid(match);
    state.matchStatus = "new game";
    io.to(state.roomName).emit("update", state);
  });

  socket.on("player will unregister", () => {
    matches= matches.filter(match=>match.roomName!==socket.roomName);
    console.log(`User from room n° ${socket.roomName} disconnected`);
    socket.leftRoom=true;
    socket.disconnect();
  });
  socket.on("disconnect", () => {
    //rimuovo il match dalla lista dei match registrati
    if(socket.leftRoom)
    io.to(socket.roomName).emit("left alone");
    else
   io.to(socket.roomName).emit("connection lost");
  });
});