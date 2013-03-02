var username = "guest";
var scrollback = 10000 * 17; // scrolback lines * line height guess (revise later)

var videos = [];
var broadcasting = false;
var users = {};
var history = [];

//var PeerConnection = window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection;

var websocketChat = {
    send: function (message) {
        rtc._socket.send(message);
    },
    recv: function (message) {
        return message;
    },
    event: 'receive_chat_msg'
};

/*
var dataChannelChat = {
    send: function (message) {
        for (var connection in rtc.dataChannels) {
            var channel = rtc.dataChannels[connection];
            channel.send(message);
        }
    },
    recv:  function (channel, message) {
        return JSON.parse(message).data;
    },
    event: 'data stream data'
};
*/

function sanitize(msg) {
    return $("<div>").text(msg).html();
    //return msg;
}

function randomColor() {
    do {
        var red = ((1<<8)*Math.random()|0);
        var green = ((1<<8)*Math.random()|0);
        var blue = ((1<<8)*Math.random()|0);
        var intensity = 0.299 * red + 0.587 * green + 0.114 * blue;
        var minDistance = (1<<8);
        for (un in users) {
            minDistance = Math.min(minDistance, Math.max(Math.abs(red-users[un].r), Math.abs(green-users[un].g), Math.abs(blue-users[un].b)));
        }
    } while (intensity > 96 || (minDistance < 32 && tries < 20));
    var hex = '#'+((red<<16)+(green<<8)+blue).toString(16);
    return {'r': red, 'g': green, 'b': blue, 'hex': hex};
}

function resizeElements() {
    //$("#messageBox").width($("#chat").width() - $("#messageSubmit").outerWidth() - 6);
    if (videos.length > 0)
        $("#videoPane").show();
    else
        $("#videoPane").hide();
    if ($("#videoPane").css("display") == "block") {
        $("#videoPane").height(Math.min(240, $(window).height()/2.5));
        //console.log($('#video').height());
        for (var i=0; i<videos.length; i++) {
            videos[i].height($("#videoPane").innerHeight());
            videos[i].width(1.333 * videos[i].height());
        }
    }
    $("#chatbox").height($(window).height() - $("#chatbox").position().top - parseInt($("#chatbox").css('margin-bottom')) - $("#messageBox").height() - 48);
}

function removeVideo(videoId) {
    var video = $('#'+videoId);
    if (video) {
        video[0].src = null;
        videos.splice(videos.indexOf(video), 1);
        video.remove();
    }
}

function broadcast() {
    broadcasting = !broadcasting;
    if (broadcasting) {
        $("#broadcastButton").html("Stop Broadcasting");
        rtc.createStream({"video": true, "audio": true}, function(stream) {
            console.log("Broadcasting...");
            var video = $('<video></video>');
            video.attr('id', 'you');
            video.attr("class", "flip");
            $('#videoPane').append(video);
            videos.push(video);
            rtc.attachStream(stream, video[0].id);
            resizeElements();
            video[0].play();
            rtc.addStreams();
            rtc.sendOffers();
        }, function(stream) {
            //rtc.fire('ready');
            console.log("createStream failed.");
            if (stream)
                stream.stop();
        });
    }
    else {
        $("#broadcastButton").html("Start Broadcasting");
        removeVideo("you");
        for (var i = 0; i < rtc.streams.length; i++) {
            var stream = rtc.streams[i];
            console.log('Removing stream.');
            console.log(stream);
            for (var connection in rtc.peerConnections) {
                rtc.peerConnections[connection].removeStream(stream);
                rtc.sendOffer(connection);
            }
            stream.stop();
            console.log(stream);
        }
        rtc.streams = [];
        rtc.initializedStreams--;
        rtc.numStreams--;
        resizeElements();
    }
}

function addToChat(type, username, msg, color) {
    var messages = $('#chatbox');
    if (msg)
        msg = sanitize(msg);
    switch (type) {
        case 'join':
            msg = '<strong class="chatmsg" style="padding-left: 15px;">' + username + ' has joined the chat.</strong>';
            break;
        case 'color':
            msg = '<strong class="chatmsg" style="color: ' + color + '; padding-left: 15px;">Your color has been changed.</strong>';
            break;
        case 'nick':
            msg = '<strong class="chatmsg" style="padding-left: 15px;">' + username + ' is now know as ' + msg + '</strong>';
            break;
        case 'pubmsg':
            msg = '<span class="chatmsg" style="color: ' + color + '; padding-left: 15px;">' + username + ': ' + msg + '</span>';
            break;
        case 'pubemote':
            msg = '<span class="chatmsg" style="color: ' + color + '; padding-left: 15px;">*' + username + " " + msg + '</span>';
            break;
    }
    messages.append($(msg + '<br>'));
    messages.scrollTop(scrollback);
    if (messages.scrollTop() === scrollback) {
        messages.remove($('#chatbox .chatmsg:first,br:first'));
        messages.scrollTop(scrollback);
    }
}

function initChat() {
    var chat;

    console.log('initializing websocket chat');
    chat = websocketChat;

    var input = $('#messageBox');
    var room = 0;
    var color = randomColor();

    input.keydown(function (event) {
        var key = event.which || event.keyCode;
        if (key === 13 && input.val().trim() !== "") {
            if (input.val().trim() == "/color") {
                console.log(username);
                color = randomColor();
                console.log(username);
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "color",
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                users[username].color = color;
                console.log(username);
                addToChat("color", "", "", color.hex);
            }
            else if (input.val().slice(0, 6) === "/nick ") {
                var newUsername = input.val().slice(6).trim();
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "nick",
                        "messages": newUsername,
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("nick", username, newUsername, color.hex);
                users[newUsername] = users[username];
                delete users[username];
                console.log(users);
                username = newUsername;
            }
            else if (input.val().slice(0, 4) === "/me ") {
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "pubemote",
                        "messages": input.val().slice(4),
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("pubemote", username, input.val().slice(4), color.hex);
            }
            else {
                chat.send(JSON.stringify({
                    "eventName": "chat_msg",
                    "data": {
                        "type": "pubmsg",
                        "messages": input.val(),
                        "username": username,
                        "room": room,
                        "color": color
                    }
                }));
                addToChat("pubmsg", username, input.val(), color.hex);
            }
            history[history.length-1] = input.val();
            historyPosition = history.length;
            history.push("");
            input.val("");
        }
        else if (key === 38) { // Up arrow
            if (historyPosition > 0) {
                if (historyPosition === history.length-1)
                    history[history.length-1] = input.val();
                else if (input.val() !== history[historyPosition]) {
                    if (history[history.length-1] === "")
                        history[history.length-1] = input.val();
                    else
                    history.push(input.val());
                }
                historyPosition--;
                input.val(history[historyPosition]);
            }
        }
        else if (key === 40) { // Down arrow
            if (historyPosition < history.length-1) {
                if (input.val() !== history[historyPosition]) {
                    if (history[history.length-1] === "")
                        history[history.length-1] = input.val();
                    else
                        history.push(input.val());
                }
                historyPosition++;
                input.val(history[historyPosition]);
            }
        }
    }, false);
    rtc.on(chat.event, function () {
        var data = chat.recv.apply(this, arguments);
        //console.log(data.color);
        switch (data.type) {
            case 'join':
                addToChat(data.type, data.username);
                users[data.username] = {'color': data.color};
                break;
            case 'color':
                console.log(username);
                users[data.username].color = data.color;
                break;
            case 'nick':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                users[data.messages] = users[data.username];
                delete users[data.username];
                break;
            case 'pubmsg':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                break;
            case 'pubemote':
                addToChat(data.type, data.username, data.messages, data.color.hex);
                break;
        }
    });

    setTimeout(function () {
        chat.send(JSON.stringify({
            "eventName": "chat_msg",
            "data": {
                "type": "join",
                //"messages": joinMsg,
                "username": username,
                "room": room,
                "color": color
            }
        }));
    }, 100);
    setTimeout(function () {
        addToChat("join", username);
    }, 500);
    
    users[username] = {'color': color}
}

function init() {
    if (!PeerConnection) {
        alert("Your browser is not supported or you must turn on flags. Go to chrome://flags and turn on Enable PeerConnection, then restart Chrome.");
    }

    var room = "";
    rtc.connect("ws:" + window.location.href.substring(window.location.protocol.length).split('#')[0], room);

    rtc.on('add remote stream', function (stream, socketId) {
        console.log("Adding remote stream...");
        var video = $('<video></video>');
        video.attr('id', "remote"+socketId);
        $('#videoPane').append(video);
        videos.push(video);
        rtc.attachStream(stream, video[0].id);
        resizeElements();
        //rtc.attachStream(stream, video.id);
        video[0].play();
    });
    rtc.on("disconnect stream", function (socketId) {
        console.log("Removing "+socketId);
        removeVideo("remote"+socketId);
        //rtc.sendOffer(socketId);
        resizeElements();
    });

    //console.log(rtc.initializedStreams +' ' + rtc.numStreams);
    console.log(rtc.connections);
    setTimeout(function () {
        rtc.fire('ready');
    }, 500);
    //broadcast();
    //$("#video").show();
}

function do_login() {
    username = $('#usernameField').val().trim();
    if (username == "")
        return false;

    document.getElementById("loginFrame").style.display = "none";
    document.getElementById("chatFrame").style.display = "block";
    $('#messageBox').attr('autofocus', '');
    resizeElements();
    init();
    initChat();
    return false;
}

window.onresize = function (event) {
    resizeElements();
}

$('#usernameField').keypress(function (event) {
    var key = event.which || event.keyCode;
    if (key === 13 && $('#usernameField').val() !== "")
        do_login()
});

$('#submitLogin').click(function (event) {
    if ($('#usernameField').val() !== "")
        do_login()
});

$('#broadcastButton').click(broadcast);
