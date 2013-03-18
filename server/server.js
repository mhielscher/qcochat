var app = require('express')();
var server = require('http').createServer(app);
var webRTC = require('webrtc.io').listen(server);

server.listen(8000);

console.log(__dirname);

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

app.get('/css/normalize.min.css', function (req, res) {
  res.sendfile(__dirname + '/css/normalize.min.css');
});

app.get('/css/chat.css', function (req, res) {
  res.sendfile(__dirname + '/css/chat.css');
});

app.get('/webrtc.io.js', function (req, res) {
  res.sendfile(__dirname + '/webrtc.io.js');
});

app.get('/client.js', function (req, res) {
  res.sendfile(__dirname + '/client.js');
});

app.get('/img/arrow_down.png', function (req, res) {
  res.sendfile(__dirname + '/img/arrow_down.png');
}

app.get('/*', function(req, res) {
  res.sendfile(__dirname + '/index.html');
});

var users = {};

webRTC.rtc.on('connect', function(rtc) {
  //Client connected
});

webRTC.rtc.on('send answer', function(rtc) {
  //answer sent
});

webRTC.rtc.on('disconnect', function(rtc) {
  //Client disconnect 
});

webRTC.rtc.on('room_leave', function(room, socketId) {
  //console.log(socketId+' has left room '+room+'.');
  for (un in users[room]) {
    //console.log(un+' is '+users[room][un].socketId);
    if (users[room][un].socketId === socketId) {
      delete users[room][un];
      //console.log('Deleted user '+un+' ('+socketId+').');
    }
  }
});

webRTC.rtc.on('chat_msg', function(data, socket) {
  //console.log(data);
  var roomList = webRTC.rtc.rooms[data.room] || [];

  for (var i = 0; i < roomList.length; i++) {
    var socketId = roomList[i];

    if (socketId !== socket.id) {
      var soc = webRTC.rtc.getSocket(socketId);

      if (soc) {
        soc.send(JSON.stringify({
          "eventName": "receive_chat_msg",
          "data": {
            "type": data.type,
            "username": data.username,
            "messages": data.messages,
            "color": data.color
          }
        }), function(error) {
          if (error) {
            console.log(error);
          }
        });
      }
    }
  }
  
  // Update master userlist
  if (data.type === "join") {
    //console.log(data.username + " joined.");
    // Save master user list entry
    if (users[data.room] === undefined)
        users[data.room] = {}
    users[data.room][data.username] = {'socketId': data.messages, 'color': data.color};
    
    // Send user list to new user
    var mySoc = webRTC.rtc.getSocket(socket.id);
    for (un in users[data.room]) {
      if (un !== data.username) {
        mySoc.send(JSON.stringify({
          "eventName": "receive_chat_msg",
          "data": {
            "type": "join",
            "username": un,
            "messages": users[data.room][un].socketId,
            "color": users[data.room][un].color
          }
        }), function(error) {
          if (error) {
            console.log(error);
          }
        });
      }
    }
  }
  else if (data.type === "color")
    users[data.room][data.username].color = data.color;
  else if (data.type === "nick") {
    console.log("Before:");
    console.log(users);
    users[data.room][data.messages] = users[data.room][data.username];
    delete users[data.room][data.username];
    console.log("After:");
    console.log(users);
  }
});
